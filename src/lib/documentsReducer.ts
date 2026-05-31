import type { DocumentEditState, DocumentEntry } from '../types/document';

export type DocumentsState = {
  documents: DocumentEntry[];
  activeId: string | null;
};

export type DocumentsAction =
  | { type: 'add'; entries: DocumentEntry[] }
  | { type: 'setActive'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'updateEdit'; id: string; edit: DocumentEditState }
  | { type: 'reset' };

export const initialDocumentsState: DocumentsState = {
  documents: [],
  activeId: null,
};

export function documentsReducer(
  state: DocumentsState,
  action: DocumentsAction,
): DocumentsState {
  switch (action.type) {
    case 'add': {
      if (action.entries.length === 0) {
        return state;
      }

      const documents = [...state.documents, ...action.entries];

      return {
        documents,
        // Keep the current active doc if there is one; otherwise focus the
        // first newly added document.
        activeId: state.activeId ?? action.entries[0].id,
      };
    }

    case 'setActive': {
      if (!state.documents.some((document) => document.id === action.id)) {
        return state;
      }

      return { ...state, activeId: action.id };
    }

    case 'remove': {
      const index = state.documents.findIndex(
        (document) => document.id === action.id,
      );

      if (index === -1) {
        return state;
      }

      const documents = state.documents.filter(
        (document) => document.id !== action.id,
      );

      let activeId = state.activeId;

      if (state.activeId === action.id) {
        // Move focus to the neighbouring document (next, else previous).
        const fallback = documents[index] ?? documents[index - 1] ?? null;
        activeId = fallback ? fallback.id : null;
      }

      return { documents, activeId };
    }

    case 'updateEdit': {
      let changed = false;
      const documents = state.documents.map((document) => {
        if (document.id !== action.id) {
          return document;
        }

        changed = true;
        return { ...document, edit: action.edit };
      });

      return changed ? { ...state, documents } : state;
    }

    case 'reset': {
      return initialDocumentsState;
    }

    default:
      return state;
  }
}
