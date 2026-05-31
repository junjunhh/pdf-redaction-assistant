import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DetectedEntity, ManualRedaction, TextBounds } from '../types/entity';

type TextPosition = {
  node: Text;
  offset: number;
};

type ViewportWithPdfPoint = {
  width: number;
  height: number;
  convertToPdfPoint?: (x: number, y: number) => number[];
};

export async function measurePdfHighlightBoxes(
  pdfDocument: PDFDocumentProxy,
  entities: DetectedEntity[],
): Promise<Map<string, TextBounds[]>> {
  const entitiesByPage = groupEntitiesByPage(entities);
  const measuredBoxes = new Map<string, TextBounds[]>();

  for (const [pageNumber, pageEntities] of entitiesByPage) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const frameNode = document.createElement('div');
    const textLayerNode = document.createElement('div');
    const textLayer = new TextLayer({
      container: textLayerNode,
      textContentSource: textContent,
      viewport,
    });

    frameNode.style.position = 'absolute';
    frameNode.style.left = '-100000px';
    frameNode.style.top = '0';
    frameNode.style.width = `${viewport.width}px`;
    frameNode.style.height = `${viewport.height}px`;
    frameNode.style.overflow = 'hidden';
    frameNode.style.opacity = '0';
    frameNode.style.pointerEvents = 'none';

    textLayerNode.className = 'pdf-text-layer';
    textLayerNode.style.position = 'absolute';
    textLayerNode.style.inset = '0';
    textLayerNode.style.setProperty('--scale-factor', '1');

    frameNode.append(textLayerNode);
    document.body.append(frameNode);

    try {
      await textLayer.render();

      const textPositions = mapTextLayerPositions(textLayerNode);

      pageEntities.forEach((entity) => {
        const cssBoxes = measureEntityBoxes(
          entity,
          frameNode,
          textPositions,
        );
        const pdfBoxes = cssBoxes.flatMap((box) => {
          const pdfBox = toPdfBox(box, viewport);

          return pdfBox ? [pdfBox] : [];
        });

        if (pdfBoxes.length > 0) {
          measuredBoxes.set(entity.id, pdfBoxes);
        }
      });
    } finally {
      textLayer.cancel();
      frameNode.remove();
    }
  }

  return measuredBoxes;
}

export async function measureManualRedactionPdfBoxes(
  pdfDocument: PDFDocumentProxy,
  manualRedactions: ManualRedaction[],
): Promise<Map<string, TextBounds[]>> {
  const redactionsByPage = groupRedactionsByPage(manualRedactions);
  const measuredBoxes = new Map<string, TextBounds[]>();

  for (const [pageNumber, pageRedactions] of redactionsByPage) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });

    pageRedactions.forEach((redaction) => {
      const pdfBoxes = redaction.boxes.flatMap((box) => {
        const pdfBox = toPdfBox(box, viewport);

        return pdfBox ? [pdfBox] : [];
      });

      if (pdfBoxes.length > 0) {
        measuredBoxes.set(redaction.id, pdfBoxes);
      }
    });
  }

  return measuredBoxes;
}

function groupEntitiesByPage(entities: DetectedEntity[]) {
  const entitiesByPage = new Map<number, DetectedEntity[]>();

  entities.forEach((entity) => {
    const pageEntities = entitiesByPage.get(entity.pageNumber) ?? [];

    pageEntities.push(entity);
    entitiesByPage.set(entity.pageNumber, pageEntities);
  });

  return entitiesByPage;
}

function groupRedactionsByPage(redactions: ManualRedaction[]) {
  const redactionsByPage = new Map<number, ManualRedaction[]>();

  redactions.forEach((redaction) => {
    const pageRedactions = redactionsByPage.get(redaction.pageNumber) ?? [];

    pageRedactions.push(redaction);
    redactionsByPage.set(redaction.pageNumber, pageRedactions);
  });

  return redactionsByPage;
}

function mapTextLayerPositions(textLayerNode: HTMLElement) {
  const positions = new Map<number, TextPosition>();
  let normalizedOffset = 0;
  let hasText = false;

  textLayerNode.querySelectorAll('span').forEach((span) => {
    const rawText = span.textContent ?? '';
    const trimmedText = rawText.trim();
    const textNode = span.firstChild;

    if (!trimmedText || !(textNode instanceof Text)) {
      return;
    }

    if (hasText) {
      normalizedOffset += 1;
    }

    const rawStart = rawText.indexOf(trimmedText);

    for (let index = 0; index < trimmedText.length; index += 1) {
      positions.set(normalizedOffset + index, {
        node: textNode,
        offset: rawStart + index,
      });
    }

    normalizedOffset += trimmedText.length;
    hasText = true;
  });

  return positions;
}

function measureEntityBoxes(
  entity: DetectedEntity,
  frameNode: HTMLElement,
  textPositions: Map<number, TextPosition>,
) {
  if (entity.pageTextEnd <= entity.pageTextStart) {
    return [];
  }

  const startPosition = textPositions.get(entity.pageTextStart);
  const endPosition = textPositions.get(entity.pageTextEnd - 1);

  if (!startPosition || !endPosition) {
    return [];
  }

  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset + 1);

  const frameRect = frameNode.getBoundingClientRect();
  const verticalPadding = 1;
  const boxes = Array.from(range.getClientRects())
    .map((rect) => {
      const left = Math.max(rect.left, frameRect.left);
      const top = Math.max(rect.top - verticalPadding, frameRect.top);
      const right = Math.min(rect.right, frameRect.right);
      const bottom = Math.min(rect.bottom + verticalPadding, frameRect.bottom);

      return {
        x: left - frameRect.left,
        y: top - frameRect.top,
        width: right - left,
        height: bottom - top,
      };
    })
    .filter((box) => box.width > 1 && box.height > 1);

  range.detach();

  return mergeLineBoxes(boxes);
}

function mergeLineBoxes(boxes: TextBounds[]) {
  const sortedBoxes = [...boxes].sort(
    (first, second) => first.y - second.y || first.x - second.x,
  );
  const mergedBoxes: TextBounds[] = [];

  sortedBoxes.forEach((box) => {
    const currentLine = mergedBoxes.find((lineBox) => boxesShareLine(lineBox, box));

    if (!currentLine) {
      mergedBoxes.push({ ...box });
      return;
    }

    const left = Math.min(currentLine.x, box.x);
    const top = Math.min(currentLine.y, box.y);
    const right = Math.max(currentLine.x + currentLine.width, box.x + box.width);
    const bottom = Math.max(currentLine.y + currentLine.height, box.y + box.height);

    currentLine.x = left;
    currentLine.y = top;
    currentLine.width = right - left;
    currentLine.height = bottom - top;
  });

  return mergedBoxes;
}

function boxesShareLine(first: TextBounds, second: TextBounds) {
  const firstMiddle = first.y + first.height / 2;
  const secondMiddle = second.y + second.height / 2;
  const verticalTolerance = Math.max(first.height, second.height) * 0.6;

  return Math.abs(firstMiddle - secondMiddle) <= verticalTolerance;
}

function toPdfBox(box: TextBounds, viewport: ViewportWithPdfPoint) {
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
