import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Trash2 } from 'lucide-react';
import { isPdfCancellationError } from '../lib/pdfErrors';

type PdfThumbnailProps = {
  isActive: boolean;
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  onClick: () => void;
  onDelete: () => void;
};

type ThumbnailState = 'loading' | 'ready' | 'error';
type CachedThumbnail = {
  dataUrl: string;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
};

const MAX_CACHED_THUMBNAILS = 240;
const thumbnailCache = new Map<string, CachedThumbnail>();

function getThumbnailCacheKey(
  pdfDocument: PDFDocumentProxy,
  pageNumber: number,
) {
  return `${pdfDocument.fingerprints[0] ?? 'pdf'}:${pageNumber}`;
}

export function clearThumbnailCacheForDocument(pdfDocument: PDFDocumentProxy) {
  const documentKey = `${pdfDocument.fingerprints[0] ?? 'pdf'}:`;

  Array.from(thumbnailCache.keys()).forEach((cacheKey) => {
    if (cacheKey.startsWith(documentKey)) {
      thumbnailCache.delete(cacheKey);
    }
  });
}

function rememberThumbnail(cacheKey: string, thumbnail: CachedThumbnail) {
  if (!thumbnailCache.has(cacheKey) && thumbnailCache.size >= MAX_CACHED_THUMBNAILS) {
    const oldestKey = thumbnailCache.keys().next().value;

    if (oldestKey) {
      thumbnailCache.delete(oldestKey);
    }
  }

  thumbnailCache.set(cacheKey, thumbnail);
}

function PdfThumbnail({
  isActive,
  pageNumber,
  pdfDocument,
  onClick,
  onDelete,
}: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [thumbnailState, setThumbnailState] = useState<ThumbnailState>('loading');

  useEffect(() => {
    let isCancelled = false;
    let renderTask: RenderTask | null = null;
    const cacheKey = getThumbnailCacheKey(pdfDocument, pageNumber);

    async function renderThumbnail() {
      setThumbnailState('loading');

      try {
        const cachedThumbnail = thumbnailCache.get(cacheKey);
        const cachedCanvas = canvasRef.current;

        if (cachedThumbnail && cachedCanvas) {
          const context = cachedCanvas.getContext('2d');

          if (!context) {
            throw new Error('Thumbnail canvas is not available.');
          }

          cachedCanvas.width = cachedThumbnail.width;
          cachedCanvas.height = cachedThumbnail.height;
          cachedCanvas.style.width = `${cachedThumbnail.cssWidth}px`;
          cachedCanvas.style.height = `${cachedThumbnail.cssHeight}px`;

          const image = new Image();
          image.onload = () => {
            if (isCancelled) {
              return;
            }

            context.clearRect(0, 0, cachedThumbnail.width, cachedThumbnail.height);
            context.drawImage(
              image,
              0,
              0,
              cachedThumbnail.width,
              cachedThumbnail.height,
            );
            setThumbnailState('ready');
          };
          image.onerror = () => {
            if (!isCancelled) {
              setThumbnailState('error');
            }
          };
          image.src = cachedThumbnail.dataUrl;
          return;
        }

        const page = await pdfDocument.getPage(pageNumber);

        if (isCancelled) {
          return;
        }

        const viewport = page.getViewport({ scale: 0.18 });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');

        if (!canvas || !context) {
          throw new Error('Thumbnail canvas is not available.');
        }

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;

        if (!isCancelled) {
          rememberThumbnail(cacheKey, {
            dataUrl: canvas.toDataURL('image/jpeg', 0.78),
            width: canvas.width,
            height: canvas.height,
            cssWidth: Math.floor(viewport.width),
            cssHeight: Math.floor(viewport.height),
          });
          setThumbnailState('ready');
        }
      } catch (error) {
        if (!isCancelled && !isPdfCancellationError(error)) {
          setThumbnailState('error');
        }
      }
    }

    renderThumbnail();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdfDocument]);

  return (
    <div className="relative group">
      <button
        aria-current={isActive ? 'page' : undefined}
        className={`w-full aspect-[8.5/11] rounded border-2 overflow-hidden grid place-items-center bg-white transition-all ${
          isActive
            ? 'border-blue-500 ring-2 ring-blue-200'
            : 'border-gray-300 hover:border-blue-300'
        }`}
        onClick={onClick}
        type="button"
      >
        {thumbnailState === 'loading' && (
          <span className="absolute text-[0.6rem] text-gray-400">Loading</span>
        )}
        {thumbnailState === 'error' && (
          <span className="absolute text-[0.6rem] text-red-400">Error</span>
        )}
        <canvas
          className="max-w-full max-h-full object-contain data-[visible=false]:opacity-0"
          data-visible={thumbnailState === 'ready'}
          ref={canvasRef}
        />
      </button>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="text-xs text-gray-600 font-medium">Page {pageNumber}</span>
        <button
          aria-label={`Delete page ${pageNumber}`}
          className="grid place-items-center h-5 w-5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-opacity"
          title={`Delete page ${pageNumber}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="w-3 h-3 text-red-500" />
        </button>
      </div>
    </div>
  );
}

export default PdfThumbnail;
