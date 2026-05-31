import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function loadPdfDocument(
  source: File | ArrayBuffer,
): Promise<PDFDocumentProxy> {
  const data = source instanceof File ? await source.arrayBuffer() : source;
  const loadingTask = getDocument({ data });

  return loadingTask.promise;
}
