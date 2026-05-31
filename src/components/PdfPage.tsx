import { useCallback, useEffect, useRef, useState } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type {
  DetectedEntity,
  EntityType,
  ManualRedaction,
  ManualRedactionSource,
  SearchMatch,
  TextBounds,
} from '../types/entity';
import { isPdfCancellationError } from '../lib/pdfErrors';

type PdfPageProps = {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  registerPageRef: (pageNumber: number, node: HTMLElement | null) => void;
  selectedEntities: DetectedEntity[];
  activeEntity: DetectedEntity | null;
  blackedOutEntityIds: ReadonlySet<string>;
  onEntityBlackout: (entityId: string) => void;
  searchMatches: SearchMatch[];
  manualRedactions: ManualRedaction[];
  activeManualRedactionId: string | null;
  blackedOutManualRedactionIds: ReadonlySet<string>;
  onManualRedactionBlackout: (redactionId: string) => void;
  isManualRedactionEnabled: boolean;
  isDrawRegionEnabled: boolean;
  shouldRenderPage: boolean;
  scale: number;
  viewerRef: RefObject<HTMLDivElement>;
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

type RenderState = 'idle' | 'loading' | 'ready' | 'error';
type PageViewportSize = {
  width: number;
  height: number;
};
type HighlightBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// Which edges each handle moves, and its CSS cursor.
const RESIZE_HANDLES: Array<{
  handle: ResizeHandle;
  left: number;
  top: number;
  cursor: string;
}> = [
  { handle: 'nw', left: 0, top: 0, cursor: 'nwse-resize' },
  { handle: 'n', left: 0.5, top: 0, cursor: 'ns-resize' },
  { handle: 'ne', left: 1, top: 0, cursor: 'nesw-resize' },
  { handle: 'e', left: 1, top: 0.5, cursor: 'ew-resize' },
  { handle: 'se', left: 1, top: 1, cursor: 'nwse-resize' },
  { handle: 's', left: 0.5, top: 1, cursor: 'ns-resize' },
  { handle: 'sw', left: 0, top: 1, cursor: 'nesw-resize' },
  { handle: 'w', left: 0, top: 0.5, cursor: 'ew-resize' },
];

const MIN_REGION_SIZE = 8;
type TextPosition = {
  node: Text;
  offset: number;
};
type TextHighlightSource = {
  pageTextStart: number;
  pageTextEnd: number;
  bbox: TextBounds | null;
};

const MAX_OUTPUT_SCALE = 2;
const MAX_CANVAS_PIXELS = 8_000_000;

// Cache each page's unscaled (scale=1) pixel size so a not-yet-rendered page's
// placeholder can reserve the page's true height — eliminating the layout shift
// when windowed pages render/unrender on large documents.
const pageSizeCache = new Map<string, PageViewportSize>();
// Last measured size per document, used as a best-guess for pages that have
// never rendered (most PDFs have uniform page sizes).
const documentPageSizeFallback = new Map<string, PageViewportSize>();

function getDocumentKey(pdfDocument: PDFDocumentProxy) {
  return pdfDocument.fingerprints[0] ?? 'pdf';
}

export function clearPdfPageCachesForDocument(pdfDocument: PDFDocumentProxy) {
  const documentKey = getDocumentKey(pdfDocument);
  const pageKeyPrefix = `${documentKey}:`;

  Array.from(pageSizeCache.keys()).forEach((cacheKey) => {
    if (cacheKey.startsWith(pageKeyPrefix)) {
      pageSizeCache.delete(cacheKey);
    }
  });
  documentPageSizeFallback.delete(documentKey);
}

function getPageSizeCacheKey(pdfDocument: PDFDocumentProxy, pageNumber: number) {
  return `${getDocumentKey(pdfDocument)}:${pageNumber}`;
}

function getEstimatedPageSize(
  pdfDocument: PDFDocumentProxy,
  pageNumber: number,
) {
  return (
    pageSizeCache.get(getPageSizeCacheKey(pdfDocument, pageNumber)) ??
    documentPageSizeFallback.get(getDocumentKey(pdfDocument)) ??
    null
  );
}

function PdfPage({
  pdfDocument,
  pageNumber,
  registerPageRef,
  selectedEntities,
  activeEntity,
  blackedOutEntityIds,
  onEntityBlackout,
  searchMatches,
  manualRedactions,
  activeManualRedactionId,
  blackedOutManualRedactionIds,
  onManualRedactionBlackout,
  isManualRedactionEnabled,
  isDrawRegionEnabled,
  shouldRenderPage,
  scale,
  viewerRef,
  onManualRedactionCreate,
  onManualRedactionSelect,
  onManualRedactionCategoryChange,
  onManualRedactionUpdateBox,
  onManualRedactionDelete,
}: PdfPageProps) {
  const pageRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerInstanceRef = useRef<TextLayer | null>(null);
  const renderVersionRef = useRef(0);
  const mountedRef = useRef(false);
  const [isNearViewport, setIsNearViewport] = useState(pageNumber === 1);
  const [viewportSize, setViewportSize] = useState<PageViewportSize | null>(
    null,
  );
  // Placeholder size for a not-yet-rendered page, from the cached unscaled
  // dimensions × current scale. Falls back to undefined (CSS aspect-ratio box)
  // until this page has been measured at least once.
  const cachedUnscaledSize = getEstimatedPageSize(pdfDocument, pageNumber);
  const placeholderSize = cachedUnscaledSize
    ? {
        width: cachedUnscaledSize.width * scale,
        height: cachedUnscaledSize.height * scale,
      }
    : null;
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  const [selectedHighlightBoxes, setSelectedHighlightBoxes] = useState<
    Array<{
      id: string;
      type: DetectedEntity['type'];
      isActive: boolean;
      box: HighlightBox;
    }>
  >([]);
  const [searchHighlightBoxes, setSearchHighlightBoxes] = useState<
    Array<{ id: string; box: HighlightBox }>
  >([]);
  const [renderState, setRenderState] = useState<RenderState>('idle');
  // Live freehand draw rectangle, in frame-local CSS pixels (already scaled).
  const [drawRect, setDrawRect] = useState<HighlightBox | null>(null);
  const drawRectRef = useRef<HighlightBox | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  // Live resize/move of the active manual redaction (scaled CSS px). When set,
  // it overrides the stored box for `transform.redactionId`/`boxIndex`.
  const [transformBox, setTransformBox] = useState<HighlightBox | null>(null);
  const transformRef = useRef<{
    redactionId: string;
    boxIndex: number;
    mode: ResizeHandle | 'move';
    startX: number;
    startY: number;
    startBox: HighlightBox;
    moved: boolean;
  } | null>(null);
  const transformBoxRef = useRef<HighlightBox | null>(null);
  const justTransformedRef = useRef(false);
  const activeManualRedaction =
    manualRedactions.find((redaction) => redaction.id === activeManualRedactionId) ??
    null;
  const setPageRef = useCallback(
    (node: HTMLElement | null) => {
      pageRef.current = node;
      registerPageRef(pageNumber, node);
    },
    [pageNumber, registerPageRef],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const pageNode = pageRef.current;
    const viewerNode = viewerRef.current;

    if (!pageNode || !viewerNode) {
      setIsNearViewport(pageNumber === 1);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsNearViewport(entry.isIntersecting),
      {
        root: viewerNode,
        rootMargin: '360px 0px',
        threshold: 0.01,
      },
    );

    observer.observe(pageNode);

    return () => observer.disconnect();
  }, [pageNumber, viewerRef]);

  useEffect(() => {
    const renderVersion = renderVersionRef.current + 1;
    renderVersionRef.current = renderVersion;
    let isCancelled = false;

    async function renderPage() {
      const previousRenderTask = renderTaskRef.current;
      const previousTextLayer = textLayerInstanceRef.current;

      previousTextLayer?.cancel();

      if (previousRenderTask) {
        previousRenderTask.cancel();

        try {
          await previousRenderTask.promise;
        } catch (error) {
          if (!isPdfCancellationError(error)) {
            console.error(`Previous render for page ${pageNumber} failed.`, error);
          }
        }
      }

      if (
        isCancelled ||
        !mountedRef.current ||
        renderVersionRef.current !== renderVersion
      ) {
        return;
      }

      if (!isNearViewport || !shouldRenderPage) {
        clearPageLayers(canvasRef.current, textLayerRef.current);
        setSelectedHighlightBoxes([]);
        setSearchHighlightBoxes([]);
        setRenderState('idle');
        return;
      }

      setRenderState('loading');
      setSelectedHighlightBoxes([]);
      setSearchHighlightBoxes([]);

      try {
        const page = await pdfDocument.getPage(pageNumber);

        if (isCancelled) {
          return;
        }

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        const textLayerNode = textLayerRef.current;

        if (!canvas || !context || !textLayerNode) {
          throw new Error('PDF page layers are not available.');
        }

        const viewportWidth = viewport.width;
        const viewportHeight = viewport.height;
        // Remember the unscaled size so future placeholders reserve true height.
        const unscaledSize = {
          width: viewportWidth / scale,
          height: viewportHeight / scale,
        };
        pageSizeCache.set(
          getPageSizeCacheKey(pdfDocument, pageNumber),
          unscaledSize,
        );
        documentPageSizeFallback.set(getDocumentKey(pdfDocument), unscaledSize);
        const outputScale = getSafeOutputScale(viewportWidth, viewportHeight);
        canvas.width = Math.max(1, Math.floor(viewportWidth * outputScale));
        canvas.height = Math.max(1, Math.floor(viewportHeight * outputScale));
        canvas.style.width = `${viewportWidth}px`;
        canvas.style.height = `${viewportHeight}px`;
        setViewportSize({ width: viewportWidth, height: viewportHeight });

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        textLayerNode.textContent = '';
        textLayerNode.style.setProperty('--scale-factor', String(scale));

        const textContent = await page.getTextContent();
        const renderTask = page.render({ canvasContext: context, viewport });
        const textLayer = new TextLayer({
          container: textLayerNode,
          textContentSource: textContent,
          viewport,
        });
        renderTaskRef.current = renderTask;
        textLayerInstanceRef.current = textLayer;

        await Promise.all([renderTask.promise, textLayer.render()]);

        if (
          !isCancelled &&
          mountedRef.current &&
          renderVersionRef.current === renderVersion
        ) {
          setRenderState('ready');
          setTextLayerVersion((current) => current + 1);
        }
      } catch (error) {
        if (
          !isCancelled &&
          mountedRef.current &&
          renderVersionRef.current === renderVersion &&
          !isPdfCancellationError(error)
        ) {
          console.error(`Could not render PDF page ${pageNumber}.`, error);
          setRenderState('error');
        }
      } finally {
        if (renderVersionRef.current === renderVersion) {
          renderTaskRef.current = null;
          textLayerInstanceRef.current = null;
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      renderTaskRef.current?.cancel();
      textLayerInstanceRef.current?.cancel();
    };
  }, [isNearViewport, pageNumber, pdfDocument, scale, shouldRenderPage]);

  useEffect(() => {
    if (renderState !== 'ready' || !viewportSize) {
      setSelectedHighlightBoxes([]);
      setSearchHighlightBoxes([]);
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setSelectedHighlightBoxes(
        selectedEntities.flatMap((entity) => {
          const box = measureTextHighlight(
            entity,
            frameRef.current,
            textLayerRef.current,
            scale,
          );

          return box
            ? [
                {
                  id: entity.id,
                  type: entity.type,
                  isActive: activeEntity?.id === entity.id,
                  box,
                },
              ]
            : [];
        }),
      );

      setSearchHighlightBoxes(
        searchMatches.flatMap((match) => {
          const box = measureTextHighlight(
            match,
            frameRef.current,
            textLayerRef.current,
            scale,
          );

          return box ? [{ id: match.id, box }] : [];
        }),
      );
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    renderState,
    activeEntity,
    scale,
    searchMatches,
    selectedEntities,
    textLayerVersion,
    viewportSize,
  ]);

  const handleManualTextSelection = useCallback(() => {
    if (!isManualRedactionEnabled || renderState !== 'ready') {
      return;
    }

    window.requestAnimationFrame(() => {
      const boxes = getSelectionBoxes(
        frameRef.current,
        textLayerRef.current,
        scale,
      );
      const selectedText = window.getSelection()?.toString() ?? '';

      if (boxes.length > 0) {
        onManualRedactionCreate(pageNumber, boxes, selectedText, 'text');
        window.getSelection()?.removeAllRanges();
      } else {
        onManualRedactionSelect(null);
      }
    });
  }, [
    isManualRedactionEnabled,
    onManualRedactionCreate,
    pageNumber,
    renderState,
    scale,
  ]);

  const handleDrawPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDrawRegionEnabled || renderState !== 'ready') {
        return;
      }

      const frameRect = frameRef.current?.getBoundingClientRect();

      if (!frameRect) {
        return;
      }

      event.preventDefault();

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort (e.g. synthetic events); ignore.
      }

      const x = event.clientX - frameRect.left;
      const y = event.clientY - frameRect.top;
      const rect = { x, y, width: 0, height: 0 };
      drawStartRef.current = { x, y };
      drawRectRef.current = rect;
      setDrawRect(rect);
    },
    [isDrawRegionEnabled, renderState],
  );

  const handleDrawPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = drawStartRef.current;
      const frameRect = frameRef.current?.getBoundingClientRect();

      if (!start || !frameRect) {
        return;
      }

      const currentX = Math.min(
        Math.max(event.clientX - frameRect.left, 0),
        frameRect.width,
      );
      const currentY = Math.min(
        Math.max(event.clientY - frameRect.top, 0),
        frameRect.height,
      );

      const rect = {
        x: Math.min(start.x, currentX),
        y: Math.min(start.y, currentY),
        width: Math.abs(currentX - start.x),
        height: Math.abs(currentY - start.y),
      };

      // Mirror into a ref so pointerup can read the final rect synchronously,
      // independent of React's render timing.
      drawRectRef.current = rect;
      setDrawRect(rect);
    },
    [],
  );

  const handleDrawPointerUp = useCallback(() => {
    const rect = drawRectRef.current;
    drawStartRef.current = null;
    drawRectRef.current = null;
    setDrawRect(null);

    // Ignore tiny drags (treated as a click, not a region).
    if (!rect || rect.width < 4 || rect.height < 4) {
      return;
    }

    // Convert frame-local CSS pixels to unscaled (scale=1) box coordinates,
    // matching how text-selection boxes are stored.
    onManualRedactionCreate(
      pageNumber,
      [
        {
          x: rect.x / scale,
          y: rect.y / scale,
          width: rect.width / scale,
          height: rect.height / scale,
        },
      ],
      'Region',
      'region',
    );
  }, [onManualRedactionCreate, pageNumber, scale]);

  // ----- Resize / move of the active manual redaction -----

  const beginTransform = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      redactionId: string,
      boxIndex: number,
      mode: ResizeHandle | 'move',
      box: HighlightBox,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // best-effort
      }

      transformRef.current = {
        redactionId,
        boxIndex,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startBox: box,
        moved: false,
      };
      transformBoxRef.current = box;
      setTransformBox(box);
    },
    [],
  );

  const handleTransformPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const t = transformRef.current;

      if (!t) {
        return;
      }

      const frameWidth = (viewportSize?.width ?? 0);
      const frameHeight = (viewportSize?.height ?? 0);
      const dx = event.clientX - t.startX;
      const dy = event.clientY - t.startY;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        t.moved = true;
      }

      let { x, y, width, height } = t.startBox;
      let right = x + width;
      let bottom = y + height;

      if (t.mode === 'move') {
        x = Math.min(Math.max(x + dx, 0), Math.max(frameWidth - width, 0));
        y = Math.min(Math.max(y + dy, 0), Math.max(frameHeight - height, 0));
        right = x + width;
        bottom = y + height;
      } else {
        if (t.mode.includes('w')) {
          x = Math.min(Math.max(x + dx, 0), right - MIN_REGION_SIZE);
        }
        if (t.mode.includes('e')) {
          right = Math.max(Math.min(right + dx, frameWidth), x + MIN_REGION_SIZE);
        }
        if (t.mode.includes('n')) {
          y = Math.min(Math.max(y + dy, 0), bottom - MIN_REGION_SIZE);
        }
        if (t.mode.includes('s')) {
          bottom = Math.max(
            Math.min(bottom + dy, frameHeight),
            y + MIN_REGION_SIZE,
          );
        }
      }

      const nextBox = {
        x,
        y,
        width: right - x,
        height: bottom - y,
      };
      transformBoxRef.current = nextBox;
      setTransformBox(nextBox);
    },
    [viewportSize],
  );

  const handleTransformPointerUp = useCallback(() => {
    const t = transformRef.current;
    const box = transformBoxRef.current;
    transformRef.current = null;
    transformBoxRef.current = null;
    // Remember a real drag so the trailing click doesn't also toggle black-out.
    justTransformedRef.current = Boolean(t?.moved);
    setTransformBox(null);

    if (!t || !box || !t.moved) {
      return;
    }

    // Commit the new geometry in unscaled (scale=1) coordinates.
    onManualRedactionUpdateBox(t.redactionId, t.boxIndex, {
      x: box.x / scale,
      y: box.y / scale,
      width: box.width / scale,
      height: box.height / scale,
    });
  }, [onManualRedactionUpdateBox, scale]);

  return (
    <article
      className="pdf-page"
      aria-label={`Page ${pageNumber}`}
      data-page-number={pageNumber}
      data-render-scale={scale}
      ref={setPageRef}
    >
      <div
        className="pdf-page-frame"
        data-render-state={renderState}
        data-sized={viewportSize || placeholderSize ? 'true' : undefined}
        ref={frameRef}
        onMouseDown={(event) => {
          // Click on empty space dismisses the active redaction's editor box.
          // Ignore clicks on a redaction overlay, its resize handles, or the
          // editor itself (those have their own handlers / stop propagation).
          if (
            activeManualRedactionId &&
            event.target instanceof HTMLElement &&
            !event.target.closest(
              '.manual-redaction-overlay, .manual-redaction-handle, .manual-redaction-editor, .entity-highlight-overlay',
            )
          ) {
            onManualRedactionSelect(null);
          }
        }}
        style={
          viewportSize
            ? {
                width: viewportSize.width,
                height: viewportSize.height,
              }
            : placeholderSize
              ? {
                  width: placeholderSize.width,
                  height: placeholderSize.height,
                }
              : undefined
        }
      >
        {renderState === 'idle' && (
          <p className="page-render-status">Page {pageNumber}</p>
        )}
        {renderState === 'loading' && (
          <p className="page-render-status">Rendering page...</p>
        )}
        {renderState === 'error' && (
          <p className="page-render-status error-message">
            Could not render this page.
          </p>
        )}
        <canvas
          className="pdf-canvas"
          data-visible={renderState === 'ready'}
          ref={canvasRef}
        />
        <div
          className="pdf-text-layer"
          data-manual-redaction={isManualRedactionEnabled}
          ref={textLayerRef}
          onMouseUp={handleManualTextSelection}
        />
        {isDrawRegionEnabled && renderState === 'ready' && (
          <div
            className="pdf-draw-layer"
            onPointerDown={handleDrawPointerDown}
            onPointerMove={handleDrawPointerMove}
            onPointerUp={handleDrawPointerUp}
          >
            {drawRect && (
              <div
                className="pdf-draw-rect"
                style={{
                  left: drawRect.x,
                  top: drawRect.y,
                  width: drawRect.width,
                  height: drawRect.height,
                }}
              />
            )}
          </div>
        )}
        {renderState === 'ready' && viewportSize && (
          <div className="pdf-highlight-layer">
            {searchHighlightBoxes.map(({ id, box }) => (
              <div
                className="entity-highlight-overlay"
                data-search-match-id={id}
                data-entity-type="search"
                key={id}
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                }}
              />
            ))}
            {selectedHighlightBoxes.map(({ id, type, isActive, box }) => {
              const isBlackedOut = blackedOutEntityIds.has(id);

              return (
                <button
                  aria-label={
                    isBlackedOut
                      ? 'Remove black-out from entity'
                      : 'Black out this entity'
                  }
                  aria-pressed={isBlackedOut}
                  className="entity-highlight-overlay"
                  data-active={isActive}
                  data-blacked-out={isBlackedOut}
                  data-entity-type={type}
                  data-entity-id={id}
                  key={id}
                  type="button"
                  title={
                    isBlackedOut ? 'Click to undo black-out' : 'Click to black out'
                  }
                  style={{
                    left: box.x,
                    top: box.y,
                    width: box.width,
                    height: box.height,
                    ...(isBlackedOut
                      ? {
                          background: '#000',
                          border: '1px solid #000',
                          opacity: 1,
                        }
                      : null),
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEntityBlackout(id);
                  }}
                />
              );
            })}
            {manualRedactions.flatMap((redaction) => {
              const isBlackedOut = blackedOutManualRedactionIds.has(
                redaction.id,
              );
              const isActive = redaction.id === activeManualRedactionId;

              return redaction.boxes.map((box, index) => {
                // While transforming this exact box, render the live geometry.
                const liveBox =
                  isActive &&
                  transformBox &&
                  transformRef.current?.redactionId === redaction.id &&
                  transformRef.current?.boxIndex === index
                    ? transformBox
                    : {
                        x: box.x * scale,
                        y: box.y * scale,
                        width: box.width * scale,
                        height: box.height * scale,
                      };
                // Only freehand drawn regions are resizable/movable; text
                // selections stay anchored to their text boxes.
                const showEditChrome = isActive && redaction.source === 'region';

                return (
                  <div key={`${redaction.id}-${index}`}>
                    <button
                      aria-label={
                        isBlackedOut
                          ? 'Remove black-out from manual redaction'
                          : 'Black out this manual redaction'
                      }
                      aria-pressed={isBlackedOut}
                      className="manual-redaction-overlay"
                      data-active={isActive}
                      data-blacked-out={isBlackedOut}
                      data-category={redaction.category}
                      data-redaction-id={redaction.id}
                      type="button"
                      title={
                        isBlackedOut
                          ? 'Click to undo black-out'
                          : 'Click to black out'
                      }
                      style={{
                        left: liveBox.x,
                        top: liveBox.y,
                        width: liveBox.width,
                        height: liveBox.height,
                        ...(showEditChrome ? { cursor: 'move' } : null),
                        ...(isBlackedOut
                          ? {
                              background: '#000',
                              border: '1px solid #000',
                              boxShadow: 'none',
                            }
                          : null),
                      }}
                      onPointerDown={(event) => {
                        if (!showEditChrome) {
                          return;
                        }
                        beginTransform(
                          event,
                          redaction.id,
                          index,
                          'move',
                          liveBox,
                        );
                      }}
                      onPointerMove={
                        showEditChrome ? handleTransformPointerMove : undefined
                      }
                      onPointerUp={
                        showEditChrome ? handleTransformPointerUp : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        // Suppress the black-out toggle if this click ended a
                        // resize/move drag.
                        if (justTransformedRef.current) {
                          justTransformedRef.current = false;
                          return;
                        }
                        onManualRedactionBlackout(redaction.id);
                      }}
                    />
                    {showEditChrome &&
                      RESIZE_HANDLES.map(({ handle, left, top, cursor }) => (
                        <div
                          key={`${redaction.id}-${index}-${handle}`}
                          className="manual-redaction-handle"
                          style={{
                            left: liveBox.x + liveBox.width * left,
                            top: liveBox.y + liveBox.height * top,
                            cursor,
                          }}
                          onPointerDown={(event) =>
                            beginTransform(
                              event,
                              redaction.id,
                              index,
                              handle,
                              liveBox,
                            )
                          }
                          onPointerMove={handleTransformPointerMove}
                          onPointerUp={handleTransformPointerUp}
                          onClick={(event) => {
                            // The click that ends a handle drag lands here, not
                            // on the box. Consume it and clear the flag so the
                            // next real box click toggles black-out normally.
                            event.stopPropagation();
                            justTransformedRef.current = false;
                          }}
                        />
                      ))}
                  </div>
                );
              });
            })}
            {activeManualRedaction && (
                <div
                  className="manual-redaction-editor"
                  style={getRedactionEditorPosition(activeManualRedaction, scale)}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                <div className="manual-redaction-editor-header">
                  <span className="manual-redaction-editor-title">
                    {activeManualRedaction.source === 'region'
                      ? 'Drawn Region'
                      : 'Text Redaction'}
                  </span>
                  <button
                    aria-label="Delete redaction"
                    className="manual-redaction-delete"
                    type="button"
                    onClick={() =>
                      onManualRedactionDelete(activeManualRedaction.id)
                    }
                  >
                    Delete
                  </button>
                </div>
                <label>
                  <span>Classify as</span>
                  <select
                    value={activeManualRedaction.category}
                    onChange={(event) =>
                      onManualRedactionCategoryChange(
                        activeManualRedaction.id,
                        event.currentTarget.value as EntityType,
                      )
                    }
                  >
                    <option value="date">Dates</option>
                    <option value="name">Person Names</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function getSafeOutputScale(viewportWidth: number, viewportHeight: number) {
  const deviceScale = Math.min(window.devicePixelRatio || 1, MAX_OUTPUT_SCALE);
  const scaledPixels = viewportWidth * viewportHeight * deviceScale * deviceScale;

  if (scaledPixels <= MAX_CANVAS_PIXELS) {
    return deviceScale;
  }

  return Math.sqrt(MAX_CANVAS_PIXELS / (viewportWidth * viewportHeight));
}

function getRedactionEditorPosition(
  redaction: ManualRedaction,
  scale: number,
) {
  const anchorBox = getUnionBox(redaction.boxes);

  if (!anchorBox) {
    return undefined;
  }

  return {
    left: anchorBox.x * scale,
    top: (anchorBox.y + anchorBox.height) * scale + 10,
  };
}

function clearPageLayers(
  canvas: HTMLCanvasElement | null,
  textLayerNode: HTMLElement | null,
) {
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
    canvas.removeAttribute('style');
  }

  if (textLayerNode) {
    textLayerNode.textContent = '';
  }
}

function getSelectionBoxes(
  frameNode: HTMLElement | null,
  textLayerNode: HTMLElement | null,
  scale: number,
): TextBounds[] {
  const selection = window.getSelection();

  if (
    !frameNode ||
    !textLayerNode ||
    !selection ||
    selection.rangeCount === 0 ||
    selection.isCollapsed ||
    !isNodeInside(selection.anchorNode, textLayerNode) ||
    !isNodeInside(selection.focusNode, textLayerNode)
  ) {
    return [];
  }

  const range = selection.getRangeAt(0);
  const frameRect = frameNode.getBoundingClientRect();

  const boxes = Array.from(range.getClientRects())
    .map((rect) => {
      const left = Math.max(rect.left, frameRect.left);
      const top = Math.max(rect.top, frameRect.top);
      const right = Math.min(rect.right, frameRect.right);
      const bottom = Math.min(rect.bottom, frameRect.bottom);

      return {
        x: (left - frameRect.left) / scale,
        y: (top - frameRect.top) / scale,
        width: (right - left) / scale,
        height: (bottom - top) / scale,
      };
    })
    .filter((box) => box.width > 1 && box.height > 1);

  return mergeLineBoxes(boxes);
}

function isNodeInside(node: Node | null, container: HTMLElement) {
  return node ? container.contains(node) : false;
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

function getUnionBox(boxes: TextBounds[]) {
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

function getFallbackHighlightBox(source: TextHighlightSource, scale: number) {
  if (!source.bbox) {
    return null;
  }

  // Mirror the 1px symmetric vertical padding the Chrome (range-rect) path adds,
  // so the stored-bbox path used by Safari lines up the same way over the text.
  const verticalPadding = 1;

  return {
    x: source.bbox.x * scale,
    y: source.bbox.y * scale - verticalPadding,
    width: source.bbox.width * scale,
    height: Math.max(source.bbox.height * scale, 10) + verticalPadding * 2,
  };
}

function shouldUseStoredHighlightBox() {
  // Safari reports Range#getClientRects() for transformed pdf.js text-layer
  // spans differently from Chrome. The stored PDF-derived bbox is tied to the
  // canvas coordinate system, so it stays aligned in Safari.
  return (
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
    navigator.vendor === 'Apple Computer, Inc.'
  );
}

function measureTextHighlight(
  source: TextHighlightSource,
  frameNode: HTMLElement | null,
  textLayerNode: HTMLElement | null,
  scale: number,
): HighlightBox | null {
  if (shouldUseStoredHighlightBox()) {
    return getFallbackHighlightBox(source, scale);
  }

  if (
    !frameNode ||
    !textLayerNode ||
    source.pageTextEnd <= source.pageTextStart
  ) {
    return getFallbackHighlightBox(source, scale);
  }

  const positions = mapTextLayerPositions(textLayerNode);
  const startPosition = positions.get(source.pageTextStart);
  const endPosition = positions.get(source.pageTextEnd - 1);

  if (!startPosition || !endPosition) {
    return getFallbackHighlightBox(source, scale);
  }

  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset + 1);

  const frameRect = frameNode.getBoundingClientRect();
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  range.detach();

  if (rects.length === 0) {
    return getFallbackHighlightBox(source, scale);
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const verticalPadding = 1;

  return {
    x: left - frameRect.left,
    y: top - frameRect.top - verticalPadding,
    width: right - left,
    height: bottom - top + verticalPadding * 2,
  };
}

export default PdfPage;
