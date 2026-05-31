import { Util } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextMatch } from './datePatterns';
import type { TextBounds } from '../types/entity';

export type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type ViewportLike = {
  scale: number;
  transform: number[];
  convertToPdfPoint?: (x: number, y: number) => number[];
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof (item as { str?: unknown }).str === 'string' &&
    'transform' in item &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

function getTextItemBbox(item: PdfTextItem, viewport: ViewportLike): TextBounds {
  const transform = Util.transform(viewport.transform, item.transform);
  const [, , verticalX, verticalY, x, baselineY] = transform;
  const transformedHeight = Math.hypot(verticalX, verticalY);
  const height = Math.max(transformedHeight || item.height * viewport.scale, 8);

  return {
    x,
    y: baselineY - height,
    width:
      item.width * viewport.scale ||
      item.str.length * Math.max(height * 0.55, 5),
    height,
  };
}

function getBoundsUnion(boxes: TextBounds[]): TextBounds | null {
  if (boxes.length === 0) {
    return null;
  }

  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function toPdfBox(box: TextBounds, viewport: ViewportLike): TextBounds | null {
  if (!viewport.convertToPdfPoint || box.width <= 0 || box.height <= 0) {
    return null;
  }

  const [x1, y1] = viewport.convertToPdfPoint(box.x, box.y);
  const [x2, y2] = viewport.convertToPdfPoint(
    box.x + box.width,
    box.y + box.height,
  );

  if (
    typeof x1 !== 'number' ||
    typeof y1 !== 'number' ||
    typeof x2 !== 'number' ||
    typeof y2 !== 'number'
  ) {
    return null;
  }

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function findTextMatchBounds(
  textItems: PdfTextItem[],
  match: TextMatch,
  viewport: ViewportLike,
): { bbox: TextBounds | null; pdfBoxes: TextBounds[] } {
  let cursor = 0;
  const boxes: TextBounds[] = [];

  for (const item of textItems) {
    const itemText = item.str.trim();

    if (!itemText) {
      continue;
    }

    const itemStart = cursor;
    const itemEnd = cursor + itemText.length;
    cursor = itemEnd + 1;

    if (match.end <= itemStart || match.start >= itemEnd) {
      continue;
    }

    const itemBbox = getTextItemBbox(item, viewport);
    const localStart = Math.max(0, Math.min(itemText.length, match.start - itemStart));
    const localEnd = Math.max(0, Math.min(itemText.length, match.end - itemStart));
    const characterWidth = itemBbox.width / Math.max(itemText.length, 1);

    if (localEnd <= localStart) {
      continue;
    }

    boxes.push({
      x: itemBbox.x + localStart * characterWidth,
      y: itemBbox.y,
      width: Math.max((localEnd - localStart) * characterWidth, 8),
      height: itemBbox.height,
    });
  }

  const pdfBoxes = boxes.flatMap((box) => {
    const pdfBox = toPdfBox(box, viewport);

    return pdfBox ? [pdfBox] : [];
  });

  return {
    bbox: getBoundsUnion(boxes),
    pdfBoxes,
  };
}

export function findTextMatchBbox(
  textItems: PdfTextItem[],
  match: TextMatch,
  viewport: ViewportLike,
) {
  return findTextMatchBounds(textItems, match, viewport).bbox;
}

export async function extractPageTextData(
  pdfDocument: PDFDocumentProxy,
  pageNumber: number,
) {
  const page = await pdfDocument.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const textItems: PdfTextItem[] = [];

  textContent.items.forEach((item) => {
    if (isPdfTextItem(item)) {
      textItems.push(item);
    }
  });

  const text = textItems
    .map((item) => item.str.trim())
    .filter(Boolean)
    .join(' ');

  return { text, textItems, viewport };
}
