import type { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextBounds } from '../types/entity';

/**
 * A rectangle to paint onto a rasterized page, in PDF user-space points with the
 * origin at the bottom-left (the same coordinate space `exportHighlightedPdf`
 * uses for its pdf-lib `drawRectangle` calls).
 */
export type PagePaintBox = {
  box: TextBounds;
  /** Fill style. Black redaction boxes are fully opaque; highlights are translucent. */
  fill: { r: number; g: number; b: number; opacity: number };
  border?: { r: number; g: number; b: number; opacity: number; width: number };
};

/** Render scale for rasterized pages. Higher keeps un-redacted text legible. */
const RASTER_SCALE = 2;

/**
 * Permanently remove the text/content of redacted pages by replacing each one
 * with a flattened image of the rendered page plus its baked-in redaction and
 * highlight boxes. Because the replacement page contains only a raster image,
 * no selectable text survives beneath the black boxes — unlike drawing opaque
 * rectangles over the original (still-extractable) text.
 *
 * Pages without any paint boxes are left untouched as vector PDFs.
 */
export async function rasterizeRedactedPages(
  pdfDoc: PDFDocument,
  pdfjsDocument: PDFDocumentProxy,
  paintBoxesByPage: Map<number, PagePaintBox[]>,
): Promise<void> {
  if (paintBoxesByPage.size === 0) {
    return;
  }

  const pages = pdfDoc.getPages();

  // Largest page index first so each replacement insert/remove leaves the
  // not-yet-processed lower indexes stable.
  const pageNumbers = Array.from(paintBoxesByPage.keys()).sort(
    (first, second) => second - first,
  );

  for (const pageNumber of pageNumbers) {
    const pageIndex = pageNumber - 1;
    const targetPage = pages[pageIndex];
    const paintBoxes = paintBoxesByPage.get(pageNumber);

    if (!targetPage || !paintBoxes || paintBoxes.length === 0) {
      continue;
    }

    const pageWidth = targetPage.getWidth();
    const pageHeight = targetPage.getHeight();
    const dataUrl = await renderPageToPng(
      pdfjsDocument,
      pageNumber,
      paintBoxes,
      pageWidth,
      pageHeight,
    );

    // Fail closed: if a redacted page can't be rasterized we must NOT hand back
    // a file that looks redacted but still has extractable text underneath.
    // Throwing lets the caller surface an error instead of silently leaking.
    if (!dataUrl) {
      throw new Error(
        `Could not rasterize page ${pageNumber} for redaction; export aborted to avoid leaking redacted text.`,
      );
    }

    const pngImage = await pdfDoc.embedPng(dataUrl);
    const replacement = pdfDoc.insertPage(pageIndex, [pageWidth, pageHeight]);

    replacement.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    // Remove the original (now shifted to pageIndex + 1).
    pdfDoc.removePage(pageIndex + 1);
  }
}

async function renderPageToPng(
  pdfjsDocument: PDFDocumentProxy,
  pageNumber: number,
  paintBoxes: PagePaintBox[],
  pageWidth: number,
  pageHeight: number,
): Promise<string | null> {
  const page = await pdfjsDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RASTER_SCALE });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  try {
    // 'print' intent renders under a separate cache key from the live viewer's
    // default 'display' renders, so an in-flight export can't collide with (or
    // be aborted by) the viewer cancelling its render of the same shared page.
    await page.render({ canvasContext: context, viewport, intent: 'print' })
      .promise;
  } catch {
    return null;
  }

  // Map PDF points (bottom-left origin) to canvas pixels (top-left origin).
  const scaleX = canvas.width / pageWidth;
  const scaleY = canvas.height / pageHeight;

  paintBoxes.forEach(({ box, fill, border }) => {
    const x = box.x * scaleX;
    const width = box.width * scaleX;
    const height = box.height * scaleY;
    // Flip the y-axis: PDF y is measured from the bottom of the page.
    const y = canvas.height - (box.y + box.height) * scaleY;

    context.globalAlpha = fill.opacity;
    context.fillStyle = rgbToCss(fill.r, fill.g, fill.b);
    context.fillRect(x, y, width, height);

    if (border) {
      context.globalAlpha = border.opacity;
      context.strokeStyle = rgbToCss(border.r, border.g, border.b);
      context.lineWidth = border.width;
      context.strokeRect(x, y, width, height);
    }
  });

  context.globalAlpha = 1;

  return canvas.toDataURL('image/png');
}

function rgbToCss(r: number, g: number, b: number) {
  const channel = (value: number) => Math.round(value * 255);

  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}
