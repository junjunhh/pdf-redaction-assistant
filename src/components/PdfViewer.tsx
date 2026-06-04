import { useCallback, useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RefObject } from 'react';
import {
  Download,
  Highlighter,
  Redo,
  Square,
  SquareDashedBottom,
  Undo,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import PdfPage from './PdfPage';
import type {
  DetectedEntity,
  EntityType,
  ManualRedaction,
  ManualRedactionSource,
  SearchMatch,
  TextBounds,
} from '../types/entity';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const LARGE_DOCUMENT_PAGE_THRESHOLD = 12;
const LARGE_DOCUMENT_RENDER_RADIUS = 2;

type PdfViewerProps = {
  fileName: string | null;
  pageCount: number;
  currentPage: number;
  visiblePageNumbers: number[];
  pdfDocument: PDFDocumentProxy | null;
  registerPageRef: (pageNumber: number, node: HTMLElement | null) => void;
  onJumpToPage: (pageNumber: number) => void;
  selectedEntities: DetectedEntity[];
  activeEntity: DetectedEntity | null;
  blackedOutEntityIds: ReadonlySet<string>;
  onEntityBlackout: (entityId: string) => void;
  manualRedactions: ManualRedaction[];
  activeManualRedactionId: string | null;
  blackedOutManualRedactionIds: ReadonlySet<string>;
  onManualRedactionBlackout: (redactionId: string) => void;
  searchMatches: SearchMatch[];
  viewerRef: RefObject<HTMLDivElement>;
  hasDocument: boolean;
  isLoading: boolean;
  error: string | null;
  canDownloadHighlightedPdf: boolean;
  isExportingHighlightedPdf: boolean;
  exportError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canBlackoutAll: boolean;
  allBlackedOut: boolean;
  onBlackoutAll: () => void;
  onDownloadHighlightedPdf: () => void;
  onManualRedactionCreate: (
    pageNumber: number,
    boxes: TextBounds[],
    text: string,
    source: ManualRedactionSource,
  ) => void;
  onManualRedactionSelect: (redactionId: string | null) => void;
  onManualRedactionCategoryChange: (
    redactionId: string,
    category: EntityType,
  ) => void;
  onManualRedactionUpdateBox: (
    redactionId: string,
    boxIndex: number,
    box: TextBounds,
  ) => void;
  onManualRedactionDelete: (redactionId: string) => void;
};

function PdfViewer({
  fileName,
  pageCount,
  currentPage,
  visiblePageNumbers,
  pdfDocument,
  registerPageRef,
  onJumpToPage,
  selectedEntities,
  activeEntity,
  blackedOutEntityIds,
  onEntityBlackout,
  manualRedactions,
  activeManualRedactionId,
  blackedOutManualRedactionIds,
  onManualRedactionBlackout,
  searchMatches,
  viewerRef,
  hasDocument,
  isLoading,
  error,
  canDownloadHighlightedPdf,
  isExportingHighlightedPdf,
  exportError,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canBlackoutAll,
  allBlackedOut,
  onBlackoutAll,
  onDownloadHighlightedPdf,
  onManualRedactionCreate,
  onManualRedactionSelect,
  onManualRedactionCategoryChange,
  onManualRedactionUpdateBox,
  onManualRedactionDelete,
}: PdfViewerProps) {
  const [scale, setScale] = useState(1.25);
  const [isManualRedactionEnabled, setIsManualRedactionEnabled] =
    useState(false);
  const [isDrawRegionEnabled, setIsDrawRegionEnabled] = useState(false);
  const [pageInput, setPageInput] = useState('1');
  const [pageBaseSize, setPageBaseSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const status = isLoading
    ? 'Loading PDF'
    : hasDocument
      ? `${visiblePageNumbers.length} of ${pageCount} ${
          pageCount === 1 ? 'page' : 'pages'
        } shown`
      : 'No document';

  useEffect(() => {
    setIsManualRedactionEnabled(false);
    setIsDrawRegionEnabled(false);
  }, [pdfDocument]);

  // Keep the page input in sync as the user scrolls through pages.
  useEffect(() => {
    if (currentPage > 0) {
      setPageInput(String(currentPage));
    }
  }, [currentPage]);

  // Capture the first page's unscaled size so we can compute fit-to-width /
  // fit-to-page zoom levels.
  useEffect(() => {
    if (!pdfDocument) {
      setPageBaseSize(null);
      return;
    }

    let isCancelled = false;

    pdfDocument
      .getPage(1)
      .then((page) => {
        if (isCancelled) {
          return;
        }

        const viewport = page.getViewport({ scale: 1 });
        setPageBaseSize({ width: viewport.width, height: viewport.height });
      })
      .catch(() => {
        if (!isCancelled) {
          setPageBaseSize(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [pdfDocument]);

  const clampScale = (value: number) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const applyScale = useCallback((value: number) => {
    setScale(clampScale(Number(value.toFixed(3))));
  }, []);

  const fitToWidth = useCallback(() => {
    const viewerNode = viewerRef.current;

    if (!viewerNode || !pageBaseSize) {
      return;
    }

    // Account for the page stack's horizontal padding (~48px) and a small gap.
    const available = viewerNode.clientWidth - 56;
    applyScale(available / pageBaseSize.width);
  }, [applyScale, pageBaseSize, viewerRef]);

  const fitToPage = useCallback(() => {
    const viewerNode = viewerRef.current;

    if (!viewerNode || !pageBaseSize) {
      return;
    }

    const availableWidth = viewerNode.clientWidth - 56;
    const availableHeight = viewerNode.clientHeight - 72;
    applyScale(
      Math.min(
        availableWidth / pageBaseSize.width,
        availableHeight / pageBaseSize.height,
      ),
    );
  }, [applyScale, pageBaseSize, viewerRef]);

  const handleZoomSelect = (value: string) => {
    if (value === 'fit-width') {
      fitToWidth();
      return;
    }

    if (value === 'fit-page') {
      fitToPage();
      return;
    }

    applyScale(Number(value));
  };

  // Forward creates to the parent; after a drawn region is created, leave draw
  // mode so the new region's overlay/editor becomes clickable again.
  const handleManualRedactionCreateFromPage = useCallback(
    (
      pageNumber: number,
      boxes: TextBounds[],
      text: string,
      source: ManualRedactionSource,
    ) => {
      onManualRedactionCreate(pageNumber, boxes, text, source);

      if (source === 'region') {
        setIsDrawRegionEnabled(false);
      }
    },
    [onManualRedactionCreate],
  );

  const commitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);

    if (
      Number.isNaN(parsed) ||
      pageCount === 0 ||
      visiblePageNumbers.length === 0
    ) {
      setPageInput(String(currentPage || 1));
      return;
    }

    const clampedPage = Math.min(pageCount, Math.max(1, parsed));
    const target =
      visiblePageNumbers.find((pageNumber) => pageNumber >= clampedPage) ??
      visiblePageNumbers[visiblePageNumbers.length - 1];
    setPageInput(String(target));
    onJumpToPage(target);
  };

  const roundedPercent = Math.round(scale * 100);
  const matchesPreset = ZOOM_PRESETS.some(
    (preset) => Math.round(preset * 100) === roundedPercent,
  );
  const shouldWindowPageRendering = pageCount > LARGE_DOCUMENT_PAGE_THRESHOLD;
  const shouldRenderPage = useCallback(
    (pageNumber: number) =>
      !shouldWindowPageRendering ||
      Math.abs(pageNumber - currentPage) <= LARGE_DOCUMENT_RENDER_RADIUS,
    [currentPage, shouldWindowPageRendering],
  );

  return (
    <section className="viewer-panel flex-1 flex flex-col min-w-0" aria-label="PDF viewer">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2 bg-white border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">PDF Viewer</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="grid place-items-center h-8 w-8 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!canUndo}
            type="button"
            title="Undo"
            onClick={onUndo}
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            className="grid place-items-center h-8 w-8 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!canRedo}
            type="button"
            title="Redo"
            onClick={onRedo}
          >
            <Redo className="w-4 h-4" />
          </button>
          <button
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-semibold transition-colors ${
              isManualRedactionEnabled
                ? 'border-red-400 bg-red-50 text-red-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            data-active={isManualRedactionEnabled}
            type="button"
            onClick={() =>
              setIsManualRedactionEnabled((current) => {
                const next = !current;
                if (next) {
                  setIsDrawRegionEnabled(false);
                }
                return next;
              })
            }
          >
            <Highlighter className="w-4 h-4" />
            Manual Redaction
          </button>
          <button
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-semibold transition-colors ${
              isDrawRegionEnabled
                ? 'border-red-400 bg-red-50 text-red-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            data-active={isDrawRegionEnabled}
            type="button"
            title="Draw a redaction box anywhere (e.g. over an image)"
            onClick={() =>
              setIsDrawRegionEnabled((current) => {
                const next = !current;
                if (next) {
                  setIsManualRedactionEnabled(false);
                }
                return next;
              })
            }
          >
            <SquareDashedBottom className="w-4 h-4" />
            Draw Region
          </button>
          <button
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            disabled={!canBlackoutAll}
            title={
              allBlackedOut
                ? 'Remove black-out from every entity and manual redaction'
                : 'Black out every detected entity and manual redaction'
            }
            onClick={onBlackoutAll}
          >
            <Square
              className={`w-4 h-4 ${allBlackedOut ? '' : 'fill-current'}`}
            />
            {allBlackedOut ? 'Clear Black-Outs' : 'Black Out All'}
          </button>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500" aria-label="Jump to page">
            <span>Page</span>
            <input
              aria-label="Page number"
              className="w-12 h-8 px-2 text-center rounded-md border border-gray-200 text-gray-800 font-semibold focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-40"
              disabled={pageCount === 0}
              inputMode="numeric"
              type="text"
              value={pageInput}
              onChange={(event) => setPageInput(event.currentTarget.value)}
              onBlur={commitPageInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
            <span>/ {pageCount || 1}</span>
          </div>
          <div className="flex items-center gap-1" aria-label="Zoom controls">
            <button
              className="grid place-items-center h-8 w-8 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              title="Zoom out"
              disabled={scale <= MIN_SCALE}
              onClick={() => applyScale(scale - 0.25)}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <select
              aria-label="Zoom level"
              className="h-8 px-2 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 bg-white"
              value={matchesPreset ? String(scale) : 'custom'}
              onChange={(event) => handleZoomSelect(event.currentTarget.value)}
            >
              {!matchesPreset && (
                <option value="custom">{roundedPercent}%</option>
              )}
              {ZOOM_PRESETS.map((preset) => (
                <option key={preset} value={String(preset)}>
                  {Math.round(preset * 100)}%
                </option>
              ))}
              <option value="fit-width">Fit width</option>
              <option value="fit-page">Fit page</option>
            </select>
            <button
              className="grid place-items-center h-8 w-8 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              title="Zoom in"
              disabled={scale >= MAX_SCALE}
              onClick={() => applyScale(scale + 0.25)}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
          <span className="text-xs text-gray-500">{status}</span>
        </div>
      </div>

      <div className="viewer-stage" ref={viewerRef}>
        {pdfDocument && visiblePageNumbers.length > 0 ? (
          <>
            {exportError && (
              <div className="export-error-banner">{exportError}</div>
            )}
            {isManualRedactionEnabled && (
              <div className="manual-redaction-banner">
                Highlight the text you want to redact.
              </div>
            )}
            {isDrawRegionEnabled && (
              <div className="manual-redaction-banner">
                Drag to draw a redaction box anywhere — including over images.
              </div>
            )}
            <div className="page-stack" aria-label={`${fileName} pages`}>
              {visiblePageNumbers.map((pageNumber) => (
                <PdfPage
                  key={`${pdfDocument.fingerprints[0] ?? fileName}-${pageNumber}`}
                  pageNumber={pageNumber}
                  pdfDocument={pdfDocument}
                  registerPageRef={registerPageRef}
                  selectedEntities={selectedEntities.filter(
                    (entity) => entity.pageNumber === pageNumber,
                  )}
                  activeEntity={
                    activeEntity?.pageNumber === pageNumber ? activeEntity : null
                  }
                  blackedOutEntityIds={blackedOutEntityIds}
                  onEntityBlackout={onEntityBlackout}
                  searchMatches={searchMatches.filter(
                    (match) => match.pageNumber === pageNumber,
                  )}
                  manualRedactions={manualRedactions.filter(
                    (redaction) => redaction.pageNumber === pageNumber,
                  )}
                  activeManualRedactionId={activeManualRedactionId}
                  blackedOutManualRedactionIds={blackedOutManualRedactionIds}
                  onManualRedactionBlackout={onManualRedactionBlackout}
                  isManualRedactionEnabled={isManualRedactionEnabled}
                  isDrawRegionEnabled={isDrawRegionEnabled}
                  shouldRenderPage={shouldRenderPage(pageNumber)}
                  scale={scale}
                  viewerRef={viewerRef}
                  onManualRedactionCreate={handleManualRedactionCreateFromPage}
                  onManualRedactionSelect={onManualRedactionSelect}
                  onManualRedactionCategoryChange={
                    onManualRedactionCategoryChange
                  }
                  onManualRedactionUpdateBox={onManualRedactionUpdateBox}
                  onManualRedactionDelete={onManualRedactionDelete}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="page-placeholder">
            <div className="page-line page-line-wide" />
            <div className="page-line" />
            <div className="page-line page-line-short" />
            {isLoading && <p>Reading PDF metadata...</p>}
            {!isLoading && error && <p className="error-message">{error}</p>}
            {!isLoading && !error && !hasDocument && <p>No PDF loaded</p>}
          </div>
        )}
      </div>
    </section>
  );
}

export default PdfViewer;
