import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfThumbnail from './PdfThumbnail';

type ThumbnailPanelProps = {
  activePage: number;
  pageCount: number;
  pdfDocument: PDFDocumentProxy | null;
  visiblePageNumbers: number[];
  onThumbnailClick: (pageNumber: number) => void;
  onPageDelete: (pageNumber: number) => void;
};

function ThumbnailPanel({
  activePage,
  pageCount,
  pdfDocument,
  visiblePageNumbers,
  onThumbnailClick,
  onPageDelete,
}: ThumbnailPanelProps) {
  const placeholderPages =
    pageCount > 0
      ? Array.from({ length: pageCount }, (_, index) => index + 1)
      : [1, 2, 3];

  return (
    <aside
      className="w-28 shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden"
      aria-label="Page thumbnails"
    >
      <div className="px-3 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-[0.7rem] uppercase tracking-wider font-medium text-gray-400">
          Pages
        </h2>
        <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-gray-100 text-[0.65rem] font-semibold text-gray-500">
          {visiblePageNumbers.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {pdfDocument && pageCount > 0
          ? visiblePageNumbers.map((pageNumber) => (
              <PdfThumbnail
                isActive={activePage === pageNumber}
                key={`${pdfDocument.fingerprints[0] ?? 'pdf'}-thumb-${pageNumber}`}
                pageNumber={pageNumber}
                pdfDocument={pdfDocument}
                onClick={() => onThumbnailClick(pageNumber)}
                onDelete={() => onPageDelete(pageNumber)}
              />
            ))
          : placeholderPages.map((page) => (
              <div key={page} className="relative">
                <div className="w-full aspect-[8.5/11] rounded border-2 border-gray-300 bg-white grid place-items-center">
                  <span className="text-xs text-gray-400">Page {page}</span>
                </div>
              </div>
            ))}
      </div>
    </aside>
  );
}

export default ThumbnailPanel;
