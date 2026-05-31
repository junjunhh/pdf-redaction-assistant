import { useCallback, useReducer, useRef, useState } from 'react';
import LandingUpload from './components/LandingUpload';
import Layout from './components/Layout';
import { clearPdfPageCachesForDocument } from './components/PdfPage';
import { clearThumbnailCacheForDocument } from './components/PdfThumbnail';
import { extractEntitiesFromPdf } from './lib/extractEntities';
import { loadPdfDocument } from './lib/pdfLoader';
import {
  documentsReducer,
  initialDocumentsState,
} from './lib/documentsReducer';
import { exportAllAsZip } from './lib/exportAllAsZip';
import { createEmptyEditState } from './types/document';
import type { DocumentEditState, DocumentEntry } from './types/document';
import type { DetectedEntity } from './types/entity';

const isPdfFile = (file: File) => {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
};

let documentIdCounter = 0;
const nextDocumentId = () => {
  documentIdCounter += 1;
  return `doc-${Date.now()}-${documentIdCounter}`;
};

function App() {
  const [state, dispatch] = useReducer(documentsReducer, initialDocumentsState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const loadRequestIdRef = useRef(0);

  const handleFilesSelected = useCallback(async (files: FileList | null) => {
    setError(null);

    // Validate before claiming a request id so a no-op selection (cancelled
    // dialog, non-PDF) can't supersede and orphan an in-flight load.
    if (!files || files.length === 0) {
      return;
    }

    const pdfFiles = Array.from(files).filter(isPdfFile);

    if (pdfFiles.length === 0) {
      setError('Please choose a PDF file.');
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    setIsLoading(true);

    try {
      const loadedEntries: DocumentEntry[] = [];

      for (const file of pdfFiles) {
        try {
          const pdfBytes = await file.arrayBuffer();
          const pdf = await loadPdfDocument(pdfBytes.slice(0));

          let entities: DetectedEntity[];
          let entityError: string | null = null;

          try {
            entities = await extractEntitiesFromPdf(pdf);
          } catch {
            entities = [];
            entityError =
              'The PDF opened, but text extraction failed. You can still view the pages.';
          }

          loadedEntries.push({
            id: nextDocumentId(),
            fileName: file.name,
            pdfDocument: pdf,
            originalPdfBytes: pdfBytes,
            pageCount: pdf.numPages,
            entities,
            entityError,
            edit: createEmptyEditState(),
          });
        } catch {
          // Skip individual files that fail to open; report at the end.
        }
      }

      // A newer load superseded this one — let it own the result + spinner.
      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      if (loadedEntries.length === 0) {
        setError('We could not open that PDF. Try a different PDF file.');
      } else {
        dispatch({ type: 'add', entries: loadedEntries });

        if (loadedEntries.length < pdfFiles.length) {
          setError('Some PDFs could not be opened and were skipped.');
        }
      }
    } finally {
      // Only the latest load request clears the spinner, so a superseded older
      // load can't turn off a newer load's spinner — and the spinner is always
      // cleared by whichever request is current.
      if (loadRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  const documentsRef = useRef(state.documents);
  documentsRef.current = state.documents;

  const handleSelectDocument = useCallback((id: string) => {
    dispatch({ type: 'setActive', id });
  }, []);

  const handleRemoveDocument = useCallback((id: string) => {
    const document = documentsRef.current.find((item) => item.id === id);

    if (document) {
      clearPdfPageCachesForDocument(document.pdfDocument);
      clearThumbnailCacheForDocument(document.pdfDocument);
    }

    dispatch({ type: 'remove', id });
  }, []);

  const handleEditStateChange = useCallback(
    (id: string, edit: DocumentEditState) => {
      dispatch({ type: 'updateEdit', id, edit });
    },
    [],
  );

  // Synchronous getters for each mounted document's live edit snapshot. Only
  // the active document is mounted, but the map keeps the API symmetric.
  const editSnapshotGettersRef = useRef(
    new Map<string, () => DocumentEditState>(),
  );

  const handleProvideEditSnapshot = useCallback(
    (id: string, getSnapshot: (() => DocumentEditState) | null) => {
      if (getSnapshot) {
        editSnapshotGettersRef.current.set(id, getSnapshot);
      } else {
        editSnapshotGettersRef.current.delete(id);
      }
    },
    [],
  );

  const handleDownloadAll = useCallback(async () => {
    setIsExportingAll(true);
    setError(null);

    try {
      // Flush any mounted document's latest in-memory edits into the queue so
      // the export never reads a stale snapshot (the report effect is passive).
      const documentsForExport = documentsRef.current.map((document) => {
        const getSnapshot = editSnapshotGettersRef.current.get(document.id);
        return getSnapshot ? { ...document, edit: getSnapshot() } : document;
      });

      const blob = await exportAllAsZip(documentsForExport);

      if (!blob) {
        setError('Select or redact entities before downloading.');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = 'redacted_pdfs.zip';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (downloadError) {
      console.error('Could not export PDFs as ZIP.', downloadError);
      setError('Could not download all PDFs.');
    } finally {
      setIsExportingAll(false);
    }
  }, []);

  const activeDocument =
    state.documents.find((document) => document.id === state.activeId) ?? null;

  if (!activeDocument) {
    return (
      <LandingUpload
        error={error}
        isLoading={isLoading}
        onFilesSelected={handleFilesSelected}
      />
    );
  }

  const documentTabs = state.documents.map((document) => ({
    id: document.id,
    fileName: document.fileName,
    edited:
      document.edit.selectedEntityIds.size > 0 ||
      document.edit.blackedOutEntityIds.size > 0 ||
      document.edit.manualRedactions.length > 0 ||
      document.edit.deletedEntityIds.size > 0 ||
      document.edit.deletedPageNumbers.size > 0,
  }));

  return (
    <Layout
      documentId={activeDocument.id}
      fileName={activeDocument.fileName}
      pageCount={activeDocument.pageCount}
      pdfDocument={activeDocument.pdfDocument}
      originalPdfBytes={activeDocument.originalPdfBytes}
      entities={activeDocument.entities}
      hasDocument
      isLoading={isLoading}
      entityError={activeDocument.entityError}
      error={error}
      initialEditState={activeDocument.edit}
      documentTabs={documentTabs}
      isExportingAll={isExportingAll}
      onFilesSelected={handleFilesSelected}
      onSelectDocument={handleSelectDocument}
      onRemoveDocument={handleRemoveDocument}
      onEditStateChange={handleEditStateChange}
      onProvideEditSnapshot={handleProvideEditSnapshot}
      onDownloadAll={handleDownloadAll}
    />
  );
}

export default App;
