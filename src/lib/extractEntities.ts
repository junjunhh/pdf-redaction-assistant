import type { PDFDocumentProxy } from 'pdfjs-dist';
import { findDateMatches } from './datePatterns';
import { findNameMatches } from './namePatterns';
import { extractPageTextData, findTextMatchBounds } from './pdfText';
import type { DetectedEntity, EntityType } from '../types/entity';

type EntityBbox = NonNullable<DetectedEntity['bbox']>;
type EntityPdfBoxes = NonNullable<DetectedEntity['pdfBoxes']>;

function createEntity(
  type: EntityType,
  text: string,
  pageNumber: number,
  matchIndex: number,
  pageTextStart: number,
  pageTextEnd: number,
  bbox: EntityBbox | null,
  pdfBoxes: EntityPdfBoxes,
): DetectedEntity {
  return {
    id: `${type}-${pageNumber}-${matchIndex}-${text}`,
    type,
    text,
    pageNumber,
    matchIndex,
    pageTextStart,
    pageTextEnd,
    bbox,
    pdfBoxes,
  };
}

export async function extractEntitiesFromPdf(
  pdfDocument: PDFDocumentProxy,
): Promise<DetectedEntity[]> {
  const entities: DetectedEntity[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const { text: pageText, textItems, viewport, styles } = await extractPageTextData(
      pdfDocument,
      pageNumber,
    );
    const dateMatches = findDateMatches(pageText);
    const nameMatches = findNameMatches(pageText, dateMatches);

    dateMatches.forEach((match, matchIndex) => {
      const bounds = findTextMatchBounds(textItems, match, viewport, styles);

      entities.push(
        createEntity(
          'date',
          match.text,
          pageNumber,
          matchIndex,
          match.start,
          match.end,
          bounds.bbox,
          bounds.pdfBoxes,
        ),
      );
    });

    nameMatches.forEach((match, matchIndex) => {
      const bounds = findTextMatchBounds(textItems, match, viewport, styles);

      entities.push(
        createEntity(
          'name',
          match.text,
          pageNumber,
          matchIndex,
          match.start,
          match.end,
          bounds.bbox,
          bounds.pdfBoxes,
        ),
      );
    });

    if (pageNumber % 4 === 0) {
      await yieldToBrowser();
    }
  }

  return entities;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
