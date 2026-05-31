import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractPageTextData, findTextMatchBbox } from './pdfText';
import type { TextMatch } from './datePatterns';
import type { SearchMatch } from '../types/entity';

function findQueryMatches(text: string, query: string): TextMatch[] {
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  const matches: TextMatch[] = [];

  if (!normalizedQuery) {
    return matches;
  }

  let start = normalizedText.indexOf(normalizedQuery);

  while (start !== -1) {
    const end = start + normalizedQuery.length;

    matches.push({
      text: text.slice(start, end),
      start,
      end,
    });

    start = normalizedText.indexOf(normalizedQuery, start + 1);
  }

  return matches;
}

export async function searchPdfText(
  pdfDocument: PDFDocumentProxy,
  query: string,
): Promise<SearchMatch[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const matches: SearchMatch[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const { text, textItems, viewport } = await extractPageTextData(
      pdfDocument,
      pageNumber,
    );

    findQueryMatches(text, normalizedQuery).forEach((match, matchIndex) => {
      matches.push({
        id: `search-${pageNumber}-${matchIndex}-${match.start}-${normalizedQuery}`,
        text: match.text,
        pageNumber,
        matchIndex,
        pageTextStart: match.start,
        pageTextEnd: match.end,
        bbox: findTextMatchBbox(textItems, match, viewport),
      });
    });

    if (pageNumber % 4 === 0) {
      await yieldToBrowser();
    }
  }

  return matches;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
