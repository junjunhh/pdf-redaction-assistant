import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DetectedEntity, ManualRedaction, TextBounds } from '../types/entity';
import {
  rasterizeRedactedPages,
  type PagePaintBox,
} from './rasterizeRedactedPages';

const highlightStyles = {
  date: {
    borderColor: rgb(0.85, 0.47, 0.02),
    color: rgb(0.99, 0.83, 0.3),
  },
  name: {
    borderColor: rgb(0.15, 0.39, 0.92),
    color: rgb(0.58, 0.77, 0.99),
  },
};

const HIGHLIGHT_FILL_OPACITY = 0.38;
const HIGHLIGHT_BORDER_OPACITY = 0.85;
const BLACK = { r: 0, g: 0, b: 0 };

export async function exportHighlightedPdf(
  originalPdfBytes: ArrayBuffer,
  selectedEntities: DetectedEntity[],
  measuredPdfBoxes: Map<string, TextBounds[]> = new Map(),
  manualRedactions: ManualRedaction[] = [],
  measuredManualPdfBoxes: Map<string, TextBounds[]> = new Map(),
  blackedOutEntities: DetectedEntity[] = [],
  measuredBlackoutPdfBoxes: Map<string, TextBounds[]> = new Map(),
  blackedOutManualRedactionIds: ReadonlySet<string> = new Set(),
  deletedPageNumbers: ReadonlySet<number> = new Set(),
  pdfjsDocument: PDFDocumentProxy | null = null,
) {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();
  const blackedOutEntityIds = new Set(
    blackedOutEntities.map((entity) => entity.id),
  );

  // Black-out (true redaction) boxes per page, in PDF points. Any page that has
  // at least one of these is rasterized below so the covered text is physically
  // removed from the exported PDF — drawing an opaque rectangle alone leaves the
  // original text extractable underneath.
  const redactionBoxesByPage = new Map<number, TextBounds[]>();
  const addRedactionBox = (pageNumber: number, box: TextBounds) => {
    const existing = redactionBoxesByPage.get(pageNumber) ?? [];
    existing.push(box);
    redactionBoxesByPage.set(pageNumber, existing);
  };

  blackedOutEntities.forEach((entity) => {
    const page = pages[entity.pageNumber - 1];

    if (!page) {
      return;
    }

    getEntityPdfBoxes(entity, page.getHeight(), measuredBlackoutPdfBoxes).forEach(
      (box) => {
        const pdfBox = normalizePdfBox(box);

        if (pdfBox) {
          addRedactionBox(entity.pageNumber, pdfBox);
        }
      },
    );
  });

  manualRedactions.forEach((redaction) => {
    if (!blackedOutManualRedactionIds.has(redaction.id)) {
      return;
    }

    const page = pages[redaction.pageNumber - 1];

    if (!page) {
      return;
    }

    getManualRedactionPdfBoxes(
      redaction,
      page.getHeight(),
      measuredManualPdfBoxes,
    ).forEach((box) => {
      const pdfBox = normalizePdfBox(box);

      if (pdfBox) {
        addRedactionBox(redaction.pageNumber, pdfBox);
      }
    });
  });

  const redactedPages = new Set(redactionBoxesByPage.keys());

  // Translucent highlight rectangles. On un-redacted pages they are drawn as
  // vector rectangles (kept see-through over the live text). On redacted pages
  // they must be baked into the raster instead, so they are collected here and
  // merged into the page's paint list below.
  const highlightPaintByPage = new Map<number, PagePaintBox[]>();
  const drawHighlight = (
    pageNumber: number,
    box: TextBounds,
    type: DetectedEntity['type'],
  ) => {
    const page = pages[pageNumber - 1];

    if (!page) {
      return;
    }

    const style = highlightStyles[type];

    if (redactedPages.has(pageNumber)) {
      const list = highlightPaintByPage.get(pageNumber) ?? [];
      list.push({
        box,
        fill: {
          r: style.color.red,
          g: style.color.green,
          b: style.color.blue,
          opacity: HIGHLIGHT_FILL_OPACITY,
        },
        border: {
          r: style.borderColor.red,
          g: style.borderColor.green,
          b: style.borderColor.blue,
          opacity: HIGHLIGHT_BORDER_OPACITY,
          width: 1,
        },
      });
      highlightPaintByPage.set(pageNumber, list);
      return;
    }

    page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      color: style.color,
      opacity: HIGHLIGHT_FILL_OPACITY,
      borderColor: style.borderColor,
      borderOpacity: HIGHLIGHT_BORDER_OPACITY,
      borderWidth: 1,
    });
  };

  selectedEntities.forEach((entity) => {
    // Blacked-out entities are redacted, not highlighted.
    if (blackedOutEntityIds.has(entity.id)) {
      return;
    }

    const page = pages[entity.pageNumber - 1];

    if (!page) {
      return;
    }

    getEntityPdfBoxes(entity, page.getHeight(), measuredPdfBoxes).forEach(
      (box) => {
        const pdfBox = normalizePdfBox(box);

        if (pdfBox) {
          drawHighlight(entity.pageNumber, pdfBox, entity.type);
        }
      },
    );
  });

  manualRedactions.forEach((redaction) => {
    // Blacked-out manual redactions are redacted above, not highlighted.
    if (blackedOutManualRedactionIds.has(redaction.id)) {
      return;
    }

    const page = pages[redaction.pageNumber - 1];

    if (!page) {
      return;
    }

    getManualRedactionPdfBoxes(
      redaction,
      page.getHeight(),
      measuredManualPdfBoxes,
    ).forEach((box) => {
      const pdfBox = normalizePdfBox(box);

      if (pdfBox) {
        drawHighlight(redaction.pageNumber, pdfBox, redaction.category);
      }
    });
  });

  // Build the final paint list for each redacted page: translucent highlights
  // first, opaque black redactions on top.
  const paintBoxesByPage = new Map<number, PagePaintBox[]>();

  redactedPages.forEach((pageNumber) => {
    const highlights = highlightPaintByPage.get(pageNumber) ?? [];
    const redactions = (redactionBoxesByPage.get(pageNumber) ?? []).map(
      (box): PagePaintBox => ({
        box,
        fill: { ...BLACK, opacity: 1 },
        border: { ...BLACK, opacity: 1, width: 1 },
      }),
    );

    paintBoxesByPage.set(pageNumber, [...highlights, ...redactions]);
  });

  if (paintBoxesByPage.size > 0) {
    // Redacting requires rendering the page to a raster. Without a pdf.js
    // document we cannot do that, and drawing opaque rectangles over the
    // original text would leak it — so fail closed rather than emit a file that
    // looks redacted but isn't. (Callers always pass the document.)
    if (!pdfjsDocument) {
      throw new Error(
        'Cannot redact without a rendered PDF document; export aborted to avoid leaking redacted text.',
      );
    }

    await rasterizeRedactedPages(pdfDoc, pdfjsDocument, paintBoxesByPage);
  }

  removeDeletedPages(pdfDoc, deletedPageNumbers);

  return pdfDoc.save();
}

export function getHighlightedFileName(fileName: string | null) {
  if (!fileName) {
    return 'highlighted_entities.pdf';
  }

  return fileName.toLowerCase().endsWith('.pdf')
    ? `${fileName.slice(0, -4)}_highlighted.pdf`
    : `${fileName}_highlighted.pdf`;
}

function getEntityPdfBoxes(
  entity: DetectedEntity,
  pageHeight: number,
  measuredPdfBoxes: Map<string, TextBounds[]>,
): TextBounds[] {
  const measuredBoxes = measuredPdfBoxes.get(entity.id);

  if (measuredBoxes && measuredBoxes.length > 0) {
    return measuredBoxes;
  }

  if (entity.pdfBoxes && entity.pdfBoxes.length > 0) {
    return entity.pdfBoxes;
  }

  return entity.bbox ? [cssBoxToPdfBox(entity.bbox, pageHeight)] : [];
}

function getManualRedactionPdfBoxes(
  redaction: ManualRedaction,
  pageHeight: number,
  measuredManualPdfBoxes: Map<string, TextBounds[]>,
): TextBounds[] {
  const measuredBoxes = measuredManualPdfBoxes.get(redaction.id);

  if (measuredBoxes && measuredBoxes.length > 0) {
    return measuredBoxes;
  }

  return redaction.boxes.map((box) => cssBoxToPdfBox(box, pageHeight));
}

function normalizePdfBox(box: TextBounds) {
  if (box.width <= 0 || box.height <= 0) {
    return null;
  }

  return {
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
    width: box.width,
    height: box.height,
  };
}

function cssBoxToPdfBox(box: TextBounds, pageHeight: number): TextBounds {
  return {
    x: Math.max(0, box.x),
    y: Math.max(0, pageHeight - (box.y + box.height)),
    width: box.width,
    height: box.height,
  };
}

function removeDeletedPages(
  pdfDoc: PDFDocument,
  deletedPageNumbers: ReadonlySet<number>,
) {
  if (deletedPageNumbers.size === 0) {
    return;
  }

  const pageCount = pdfDoc.getPageCount();
  const deletedIndexes = Array.from(deletedPageNumbers)
    .map((pageNumber) => pageNumber - 1)
    .filter((pageIndex) => pageIndex >= 0 && pageIndex < pageCount)
    .sort((first, second) => second - first);

  if (deletedIndexes.length >= pageCount) {
    throw new Error('Cannot export a PDF with every page deleted.');
  }

  deletedIndexes.forEach((pageIndex) => pdfDoc.removePage(pageIndex));
}
