import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  DetectedEntity,
  EntityType,
  ManualRedaction,
  TextBounds,
} from './entity';

/**
 * Undo/redo history entry. Shared between Layout and the document queue so a
 * document's history survives switching to another document and back.
 */
export type HistoryAction =
  | {
      kind: 'entity-delete';
      entityId: string;
      wasActive: boolean;
      wasSelected: boolean;
      wasBlackedOut: boolean;
    }
  | {
      kind: 'entity-blackout';
      entityId: string;
      previousBlackedOut: boolean;
      nextBlackedOut: boolean;
    }
  | {
      kind: 'manual-redaction-create';
      redaction: ManualRedaction;
      index: number;
      blackedOut: boolean;
      previousActiveEntityId: string | null;
      previousActiveManualRedactionId: string | null;
    }
  | {
      kind: 'manual-redaction-delete';
      redaction: ManualRedaction;
      index: number;
      wasActive: boolean;
      wasSelected: boolean;
      wasBlackedOut: boolean;
    }
  | {
      kind: 'manual-redaction-blackout';
      redactionId: string;
      previousBlackedOut: boolean;
      nextBlackedOut: boolean;
    }
  | {
      kind: 'manual-redaction-category-change';
      redactionId: string;
      previousCategory: EntityType;
      nextCategory: EntityType;
    }
  | {
      kind: 'manual-redaction-box-update';
      redactionId: string;
      boxIndex: number;
      previousBox: TextBounds;
      nextBox: TextBounds;
    }
  | {
      kind: 'page-delete';
      pageNumber: number;
      previousPage: number;
      nextPage: number;
      activeEntityId: string | null;
      activeManualRedactionId: string | null;
      selectedEntityIds: string[];
      selectedManualRedactionIds: string[];
    };

/**
 * The per-document editing state. This is everything Layout mutates while the
 * user reviews a document; it is stored on the document queue entry so each PDF
 * keeps its own selections, redactions, deletions and history.
 */
export type DocumentEditState = {
  currentPage: number;
  deletedPageNumbers: ReadonlySet<number>;
  deletedEntityIds: ReadonlySet<string>;
  activeEntityId: string | null;
  selectedEntityIds: ReadonlySet<string>;
  blackedOutEntityIds: ReadonlySet<string>;
  manualRedactions: ManualRedaction[];
  selectedManualRedactionIds: ReadonlySet<string>;
  blackedOutManualRedactionIds: ReadonlySet<string>;
  activeManualRedactionId: string | null;
  undoStack: HistoryAction[];
  redoStack: HistoryAction[];
};

export function createEmptyEditState(): DocumentEditState {
  return {
    currentPage: 1,
    deletedPageNumbers: new Set(),
    deletedEntityIds: new Set(),
    activeEntityId: null,
    selectedEntityIds: new Set(),
    blackedOutEntityIds: new Set(),
    manualRedactions: [],
    selectedManualRedactionIds: new Set(),
    blackedOutManualRedactionIds: new Set(),
    activeManualRedactionId: null,
    undoStack: [],
    redoStack: [],
  };
}

/**
 * A single uploaded PDF in the queue: immutable load data plus its editing
 * state snapshot.
 */
export type DocumentEntry = {
  id: string;
  fileName: string;
  pdfDocument: PDFDocumentProxy;
  originalPdfBytes: ArrayBuffer;
  pageCount: number;
  entities: DetectedEntity[];
  entityError: string | null;
  edit: DocumentEditState;
};
