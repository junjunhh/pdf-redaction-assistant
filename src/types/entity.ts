export type EntityType = 'date' | 'name';

/**
 * How a manual redaction was created:
 * - 'text'   — selected text in the text layer (kept as a translucent highlight
 *              until the user blacks it out).
 * - 'region' — a freehand drawn box (a redaction region; blacked out on create).
 */
export type ManualRedactionSource = 'text' | 'region';

export type TextBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectedEntity = {
  id: string;
  type: EntityType;
  text: string;
  pageNumber: number;
  matchIndex: number;
  pageTextStart: number;
  pageTextEnd: number;
  bbox: TextBounds | null;
  pdfBoxes?: TextBounds[];
};

export type SearchMatch = {
  id: string;
  text: string;
  pageNumber: number;
  matchIndex: number;
  pageTextStart: number;
  pageTextEnd: number;
  bbox: TextBounds | null;
};

export type ManualRedaction = {
  id: string;
  pageNumber: number;
  category: EntityType;
  text: string;
  boxes: TextBounds[];
  source: ManualRedactionSource;
};
