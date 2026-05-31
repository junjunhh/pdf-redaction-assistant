import JSZip from 'jszip';
import {
  documentHasDownloadableHighlights,
  exportDocumentBytes,
  getHighlightedFileName,
} from './exportDocument';
import type { DocumentEntry } from '../types/document';

/**
 * Export every document that has selections/redactions into a single ZIP.
 * Documents are processed sequentially to avoid offscreen-DOM thrash from the
 * highlight measurement step. Filenames are de-duplicated within the archive.
 */
export async function exportAllAsZip(
  documents: DocumentEntry[],
): Promise<Blob | null> {
  const exportable = documents.filter(documentHasDownloadableHighlights);

  if (exportable.length === 0) {
    return null;
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const entry of exportable) {
    const bytes = await exportDocumentBytes(entry);
    const baseName = getHighlightedFileName(entry.fileName);
    const uniqueName = makeUniqueName(baseName, usedNames);

    zip.file(uniqueName, bytes);
  }

  return zip.generateAsync({ type: 'blob' });
}

function makeUniqueName(name: string, used: Set<string>) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const dotIndex = name.lastIndexOf('.');
  const stem = dotIndex === -1 ? name : name.slice(0, dotIndex);
  const ext = dotIndex === -1 ? '' : name.slice(dotIndex);

  let counter = 2;
  let candidate = `${stem}_${counter}${ext}`;

  while (used.has(candidate)) {
    counter += 1;
    candidate = `${stem}_${counter}${ext}`;
  }

  used.add(candidate);
  return candidate;
}
