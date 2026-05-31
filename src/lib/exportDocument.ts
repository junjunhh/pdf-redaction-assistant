import {
  exportHighlightedPdf,
  getHighlightedFileName,
} from './exportHighlightedPdf';
import {
  measureManualRedactionPdfBoxes,
  measurePdfHighlightBoxes,
} from './measurePdfHighlightBoxes';
import type { DocumentEntry } from '../types/document';
import type { TextBounds } from '../types/entity';

const EMPTY_BOXES = new Map<string, TextBounds[]>();

/**
 * Derive the visible/selected/redacted entities for a document from its edit
 * snapshot — mirrors the filtering Layout applies for the active document so
 * the single-document and batch exports stay consistent.
 */
function deriveExportInputs(entry: DocumentEntry) {
  const { edit } = entry;
  const hasDeletedRemainingPages =
    edit.deletedPageNumbers.size > 0 &&
    edit.deletedPageNumbers.size < entry.pageCount;
  const visibleEntities = entry.entities.filter(
    (entity) =>
      !edit.deletedPageNumbers.has(entity.pageNumber) &&
      !edit.deletedEntityIds.has(entity.id),
  );

  const selectedEntities = visibleEntities.filter((entity) =>
    edit.selectedEntityIds.has(entity.id),
  );
  const blackedOutEntities = visibleEntities.filter((entity) =>
    edit.blackedOutEntityIds.has(entity.id),
  );
  // A manual redaction is exported if it is selected OR blacked out.
  const selectedManualRedactions = edit.manualRedactions.filter(
    (redaction) =>
      !edit.deletedPageNumbers.has(redaction.pageNumber) &&
      (edit.selectedManualRedactionIds.has(redaction.id) ||
        edit.blackedOutManualRedactionIds.has(redaction.id)),
  );

  return {
    selectedEntities,
    blackedOutEntities,
    selectedManualRedactions,
    blackedOutManualRedactionIds: edit.blackedOutManualRedactionIds,
    deletedPageNumbers: edit.deletedPageNumbers,
    hasDeletedRemainingPages,
  };
}

export function documentHasDownloadableHighlights(entry: DocumentEntry) {
  const {
    selectedEntities,
    blackedOutEntities,
    selectedManualRedactions,
    hasDeletedRemainingPages,
  } = deriveExportInputs(entry);

  return (
    selectedEntities.length > 0 ||
    blackedOutEntities.length > 0 ||
    selectedManualRedactions.length > 0 ||
    hasDeletedRemainingPages
  );
}

/**
 * Produce the highlighted/redacted PDF bytes for a single document, measuring
 * box positions against its pdf.js document.
 */
export async function exportDocumentBytes(
  entry: DocumentEntry,
): Promise<Uint8Array> {
  const {
    selectedEntities,
    blackedOutEntities,
    selectedManualRedactions,
    blackedOutManualRedactionIds,
    deletedPageNumbers,
  } = deriveExportInputs(entry);

  const measuredPdfBoxes = await measurePdfHighlightBoxes(
    entry.pdfDocument,
    selectedEntities,
  );
  const measuredManualPdfBoxes = await measureManualRedactionPdfBoxes(
    entry.pdfDocument,
    selectedManualRedactions,
  );
  const measuredBlackoutPdfBoxes = await measurePdfHighlightBoxes(
    entry.pdfDocument,
    blackedOutEntities,
  );

  return exportHighlightedPdf(
    entry.originalPdfBytes,
    selectedEntities,
    measuredPdfBoxes ?? EMPTY_BOXES,
    selectedManualRedactions,
    measuredManualPdfBoxes ?? EMPTY_BOXES,
    blackedOutEntities,
    measuredBlackoutPdfBoxes ?? EMPTY_BOXES,
    blackedOutManualRedactionIds,
    deletedPageNumbers,
    entry.pdfDocument,
  );
}

export { getHighlightedFileName };
