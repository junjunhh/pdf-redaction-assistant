import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Download, FileText, X } from 'lucide-react';
import ColorLegend from './ColorLegend';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../lib/useTheme';
import EntityPanel from './EntityPanel';
import FileUpload from './FileUpload';
import PdfViewer from './PdfViewer';
import {
  exportHighlightedPdf,
  getHighlightedFileName,
} from '../lib/exportHighlightedPdf';
import {
  measureManualRedactionPdfBoxes,
  measurePdfHighlightBoxes,
} from '../lib/measurePdfHighlightBoxes';
import ThumbnailPanel from './ThumbnailPanel';
import { searchPdfText } from '../lib/searchPdf';
import type {
  DetectedEntity,
  EntityType,
  ManualRedaction,
  ManualRedactionSource,
  SearchMatch,
  TextBounds,
} from '../types/entity';
import type { DocumentEditState, HistoryAction } from '../types/document';

type SearchMode = 'entity' | 'document';

type KeyboardNavigationItem =
  | {
      kind: 'entity';
      entity: DetectedEntity;
    }
  | {
      kind: 'manual-redaction';
      redaction: ManualRedaction;
    };

type DocumentTab = {
  id: string;
  fileName: string;
  edited: boolean;
};

type LayoutProps = {
  documentId: string;
  fileName: string | null;
  pageCount: number;
  pdfDocument: PDFDocumentProxy | null;
  originalPdfBytes: ArrayBuffer | null;
  entities: DetectedEntity[];
  hasDocument: boolean;
  isLoading: boolean;
  entityError: string | null;
  error: string | null;
  initialEditState: DocumentEditState;
  documentTabs: DocumentTab[];
  isExportingAll: boolean;
  onFilesSelected: (files: FileList | null) => void;
  onSelectDocument: (id: string) => void;
  onRemoveDocument: (id: string) => void;
  onEditStateChange: (id: string, edit: DocumentEditState) => void;
  onProvideEditSnapshot: (
    id: string,
    getSnapshot: (() => DocumentEditState) | null,
  ) => void;
  onDownloadAll: () => void;
};

function Layout({
  documentId,
  fileName,
  pageCount,
  pdfDocument,
  originalPdfBytes,
  entities,
  hasDocument,
  isLoading,
  entityError,
  error,
  initialEditState,
  documentTabs,
  isExportingAll,
  onFilesSelected,
  onSelectDocument,
  onRemoveDocument,
  onEditStateChange,
  onProvideEditSnapshot,
  onDownloadAll,
}: LayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const [stateDocumentId, setStateDocumentId] = useState(documentId);
  const [currentPage, setCurrentPage] = useState(initialEditState.currentPage);
  const [deletedPageNumbers, setDeletedPageNumbers] = useState<Set<number>>(
    () => new Set(initialEditState.deletedPageNumbers),
  );
  const [deletedEntityIds, setDeletedEntityIds] = useState<Set<string>>(
    () => new Set(initialEditState.deletedEntityIds),
  );
  const [activeEntityId, setActiveEntityId] = useState<string | null>(
    initialEditState.activeEntityId,
  );
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(
    () => new Set(initialEditState.selectedEntityIds),
  );
  const [blackedOutEntityIds, setBlackedOutEntityIds] = useState<Set<string>>(
    () => new Set(initialEditState.blackedOutEntityIds),
  );
  const [manualRedactions, setManualRedactions] = useState<ManualRedaction[]>(
    () => initialEditState.manualRedactions,
  );
  const [selectedManualRedactionIds, setSelectedManualRedactionIds] = useState<
    Set<string>
  >(() => new Set(initialEditState.selectedManualRedactionIds));
  const [blackedOutManualRedactionIds, setBlackedOutManualRedactionIds] =
    useState<Set<string>>(
      () => new Set(initialEditState.blackedOutManualRedactionIds),
    );
  const [activeManualRedactionId, setActiveManualRedactionId] = useState<
    string | null
  >(initialEditState.activeManualRedactionId);
  const [searchMode, setSearchMode] = useState<SearchMode>('entity');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isExportingHighlightedPdf, setIsExportingHighlightedPdf] =
    useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<HistoryAction[]>(
    () => initialEditState.undoStack,
  );
  const [redoStack, setRedoStack] = useState<HistoryAction[]>(
    () => initialEditState.redoStack,
  );
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const searchRunRef = useRef(0);

  useLayoutEffect(() => {
    setCurrentPage(initialEditState.currentPage);
    setDeletedPageNumbers(new Set(initialEditState.deletedPageNumbers));
    setDeletedEntityIds(new Set(initialEditState.deletedEntityIds));
    setActiveEntityId(initialEditState.activeEntityId);
    setSelectedEntityIds(new Set(initialEditState.selectedEntityIds));
    setBlackedOutEntityIds(new Set(initialEditState.blackedOutEntityIds));
    setManualRedactions(initialEditState.manualRedactions);
    setSelectedManualRedactionIds(
      new Set(initialEditState.selectedManualRedactionIds),
    );
    setBlackedOutManualRedactionIds(
      new Set(initialEditState.blackedOutManualRedactionIds),
    );
    setActiveManualRedactionId(initialEditState.activeManualRedactionId);
    setUndoStack(initialEditState.undoStack);
    setRedoStack(initialEditState.redoStack);
    setSearchMode('entity');
    setSearchQuery('');
    setSearchMatches([]);
    setIsSearching(false);
    setSearchError(null);
    setExportError(null);
    pageRefs.current.clear();
    viewerRef.current?.scrollTo({ top: 0 });
    setStateDocumentId(documentId);
  }, [documentId]);
  const visiblePageNumbers = useMemo(
    () =>
      Array.from({ length: pageCount }, (_, index) => index + 1).filter(
        (pageNumber) => !deletedPageNumbers.has(pageNumber),
      ),
    [deletedPageNumbers, pageCount],
  );
  const visiblePageNumberSet = useMemo(
    () => new Set(visiblePageNumbers),
    [visiblePageNumbers],
  );
  const visibleEntities = useMemo(
    () =>
      entities.filter(
        (entity) =>
          visiblePageNumberSet.has(entity.pageNumber) &&
          !deletedEntityIds.has(entity.id),
      ),
    [deletedEntityIds, entities, visiblePageNumberSet],
  );
  const visibleManualRedactions = useMemo(
    () =>
      manualRedactions.filter((redaction) =>
        visiblePageNumberSet.has(redaction.pageNumber),
      ),
    [manualRedactions, visiblePageNumberSet],
  );
  const visibleSearchMatches = useMemo(
    () =>
      searchMatches.filter((match) => visiblePageNumberSet.has(match.pageNumber)),
    [searchMatches, visiblePageNumberSet],
  );
  const activeEntity =
    visibleEntities.find((entity) => entity.id === activeEntityId) ?? null;
  const entitiesInPanelOrder = useMemo(
    () => [
      ...visibleEntities.filter((entity) => entity.type === 'date'),
      ...visibleEntities.filter((entity) => entity.type === 'name'),
    ],
    [visibleEntities],
  );
  // Left/right arrow navigation walks every detected entity and manual
  // redaction in panel order (grouped by type), regardless of selection, so the
  // arrows always step to the next/previous item and scroll it into view. (It
  // previously included only *selected* items, which made the arrows jump to an
  // unrelated item — or do nothing — when the active entity wasn't selected.)
  const keyboardNavigationEntities = useMemo(() => {
    const items: KeyboardNavigationItem[] = [];

    (['date', 'name'] as const).forEach((type) => {
      entitiesInPanelOrder
        .filter((entity) => entity.type === type)
        .forEach((entity) => items.push({ kind: 'entity', entity }));

      visibleManualRedactions
        .filter((redaction) => redaction.category === type)
        .forEach((redaction) =>
          items.push({ kind: 'manual-redaction', redaction }),
        );
    });

    return items;
  }, [entitiesInPanelOrder, visibleManualRedactions]);

  const registerPageRef = useCallback(
    (pageNumber: number, node: HTMLElement | null) => {
      if (node) {
        pageRefs.current.set(pageNumber, node);
      } else {
        pageRefs.current.delete(pageNumber);
      }
    },
    [],
  );

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const pageNode = pageRefs.current.get(pageNumber);
      const viewerNode = viewerRef.current;

      if (!pageNode) {
        return;
      }

      setCurrentPage(pageNumber);

      // Instant scroll (see scrollToEntity): a smooth scroll gets interrupted by
      // lazy page renders / the scroll-spy observer and snaps back to the top.
      if (viewerNode) {
        viewerNode.scrollTo({
          top: Math.max(0, pageNode.offsetTop - viewerNode.offsetTop),
        });
      } else {
        pageNode.scrollIntoView({ block: 'start' });
      }
    },
    [viewerRef],
  );

  const scrollToEntity = useCallback(
    (pageNumber: number, box: TextBounds | null, targetSelector: string) => {
      const pageNode = pageRefs.current.get(pageNumber);
      const viewerNode = viewerRef.current;

      setCurrentPage(pageNumber);

      if (!pageNode || !viewerNode) {
        pageNode?.scrollIntoView({ block: 'start' });
        return;
      }

      // Center the target within the viewer. We prefer the actual rendered
      // highlight overlay (pixel-accurate) but it only appears once the page
      // has rendered, so we fall back to the stored bbox (× the page's render
      // scale) for an immediate scroll, then refine to the overlay once it is
      // in the DOM. Instant (not smooth) scrolling — a smooth animation gets
      // interrupted/reset by lazy page renders and the scroll-spy observer.
      const centerOn = (): boolean => {
        const pageTopInViewer = pageNode.offsetTop - viewerNode.offsetTop;
        const scale = Number(pageNode.dataset.renderScale) || 1;
        const frameNode =
          pageNode.querySelector<HTMLElement>('.pdf-page-frame');
        const overlay = pageNode.querySelector<HTMLElement>(targetSelector);

        let offsetWithinPage: number;
        let targetHeight: number;
        const haveOverlay = Boolean(overlay && frameNode);

        if (overlay && frameNode) {
          const overlayRect = overlay.getBoundingClientRect();
          const frameRect = frameNode.getBoundingClientRect();
          offsetWithinPage = overlayRect.top - frameRect.top;
          targetHeight = overlayRect.height;
        } else if (box) {
          offsetWithinPage = box.y * scale;
          targetHeight = box.height * scale;
        } else {
          offsetWithinPage = 0;
          targetHeight = 0;
        }

        const targetCenter =
          pageTopInViewer + offsetWithinPage + targetHeight / 2;
        const nextScrollTop = Math.max(
          0,
          targetCenter - viewerNode.clientHeight / 2,
        );

        viewerNode.scrollTo({ top: nextScrollTop });

        // Report whether we've centered on the real overlay (so polling stops).
        return haveOverlay;
      };

      // Immediate scroll using the bbox estimate, then poll a few frames for
      // the overlay to render and refine onto it. Bounded so it can't loop.
      if (centerOn()) {
        return;
      }

      let attempts = 0;
      const maxAttempts = 30;
      const refine = () => {
        attempts += 1;

        if (centerOn() || attempts >= maxAttempts) {
          return;
        }

        window.requestAnimationFrame(refine);
      };

      window.requestAnimationFrame(refine);
    },
    [viewerRef],
  );

  const recordDeletionAction = useCallback((action: HistoryAction) => {
    setUndoStack((current) => [...current, action]);
    setRedoStack([]);
  }, []);

  const restoreEntityDeletion = useCallback(
    (action: Extract<HistoryAction, { kind: 'entity-delete' }>) => {
      setDeletedEntityIds((current) => {
        const nextDeletedEntityIds = new Set(current);
        nextDeletedEntityIds.delete(action.entityId);
        return nextDeletedEntityIds;
      });

      if (action.wasSelected) {
        setSelectedEntityIds((current) => {
          const nextSelectedEntityIds = new Set(current);
          nextSelectedEntityIds.add(action.entityId);
          return nextSelectedEntityIds;
        });
      }

      if (action.wasBlackedOut) {
        setBlackedOutEntityIds((current) => {
          const nextBlackedOutEntityIds = new Set(current);
          nextBlackedOutEntityIds.add(action.entityId);
          return nextBlackedOutEntityIds;
        });
      }

      if (action.wasActive) {
        setActiveEntityId(action.entityId);
        setActiveManualRedactionId(null);
      }
    },
    [],
  );

  const applyEntityDeletion = useCallback(
    (action: Extract<HistoryAction, { kind: 'entity-delete' }>) => {
      setDeletedEntityIds((current) => {
        const nextDeletedEntityIds = new Set(current);
        nextDeletedEntityIds.add(action.entityId);
        return nextDeletedEntityIds;
      });
      setSelectedEntityIds((current) => {
        if (!current.has(action.entityId)) {
          return current;
        }

        const nextSelectedEntityIds = new Set(current);
        nextSelectedEntityIds.delete(action.entityId);
        return nextSelectedEntityIds;
      });
      setBlackedOutEntityIds((current) => {
        if (!current.has(action.entityId)) {
          return current;
        }

        const nextBlackedOutEntityIds = new Set(current);
        nextBlackedOutEntityIds.delete(action.entityId);
        return nextBlackedOutEntityIds;
      });
      setActiveEntityId((current) =>
        current === action.entityId ? null : current,
      );
    },
    [],
  );

  const restoreEntityBlackout = useCallback(
    (action: Extract<HistoryAction, { kind: 'entity-blackout' }>) => {
      setBlackedOutEntityIds((current) => {
        const nextBlackedOutEntityIds = new Set(current);

        if (action.previousBlackedOut) {
          nextBlackedOutEntityIds.add(action.entityId);
        } else {
          nextBlackedOutEntityIds.delete(action.entityId);
        }

        return nextBlackedOutEntityIds;
      });
    },
    [],
  );

  const applyEntityBlackout = useCallback(
    (action: Extract<HistoryAction, { kind: 'entity-blackout' }>) => {
      setBlackedOutEntityIds((current) => {
        const nextBlackedOutEntityIds = new Set(current);

        if (action.nextBlackedOut) {
          nextBlackedOutEntityIds.add(action.entityId);
        } else {
          nextBlackedOutEntityIds.delete(action.entityId);
        }

        return nextBlackedOutEntityIds;
      });
    },
    [],
  );

  const restoreManualRedactionCreation = useCallback(
    (
      action: Extract<HistoryAction, { kind: 'manual-redaction-create' }>,
    ) => {
      setManualRedactions((current) =>
        current.filter((redaction) => redaction.id !== action.redaction.id),
      );
      setSelectedManualRedactionIds((current) => {
        if (!current.has(action.redaction.id)) {
          return current;
        }

        const nextSelectedManualRedactionIds = new Set(current);
        nextSelectedManualRedactionIds.delete(action.redaction.id);
        return nextSelectedManualRedactionIds;
      });
      setBlackedOutManualRedactionIds((current) => {
        if (!current.has(action.redaction.id)) {
          return current;
        }

        const next = new Set(current);
        next.delete(action.redaction.id);
        return next;
      });
      setActiveEntityId(action.previousActiveEntityId);
      setActiveManualRedactionId(action.previousActiveManualRedactionId);
    },
    [],
  );

  const applyManualRedactionCreation = useCallback(
    (
      action: Extract<HistoryAction, { kind: 'manual-redaction-create' }>,
    ) => {
      setManualRedactions((current) => {
        if (current.some((redaction) => redaction.id === action.redaction.id)) {
          return current;
        }

        const nextManualRedactions = [...current];
        nextManualRedactions.splice(action.index, 0, action.redaction);
        return nextManualRedactions;
      });
      setSelectedManualRedactionIds((current) => {
        const nextSelectedManualRedactionIds = new Set(current);
        nextSelectedManualRedactionIds.add(action.redaction.id);
        return nextSelectedManualRedactionIds;
      });
      if (action.blackedOut) {
        setBlackedOutManualRedactionIds((current) => {
          const next = new Set(current);
          next.add(action.redaction.id);
          return next;
        });
      }
      setActiveEntityId(null);
      setActiveManualRedactionId(action.redaction.id);
    },
    [],
  );

  const restoreManualRedactionDeletion = useCallback(
    (
      action: Extract<HistoryAction, { kind: 'manual-redaction-delete' }>,
    ) => {
      setManualRedactions((current) => {
        if (current.some((redaction) => redaction.id === action.redaction.id)) {
          return current;
        }

        const nextManualRedactions = [...current];
        nextManualRedactions.splice(action.index, 0, action.redaction);
        return nextManualRedactions;
      });

      if (action.wasSelected) {
        setSelectedManualRedactionIds((current) => {
          const nextSelectedManualRedactionIds = new Set(current);
          nextSelectedManualRedactionIds.add(action.redaction.id);
          return nextSelectedManualRedactionIds;
        });
      }

      if (action.wasBlackedOut) {
        setBlackedOutManualRedactionIds((current) => {
          const nextBlackedOut = new Set(current);
          nextBlackedOut.add(action.redaction.id);
          return nextBlackedOut;
        });
      }

      if (action.wasActive) {
        setActiveEntityId(null);
        setActiveManualRedactionId(action.redaction.id);
      }
    },
    [],
  );

  const applyManualRedactionDeletion = useCallback(
    (
      action: Extract<HistoryAction, { kind: 'manual-redaction-delete' }>,
    ) => {
      setManualRedactions((current) =>
        current.filter((redaction) => redaction.id !== action.redaction.id),
      );
      setSelectedManualRedactionIds((current) => {
        if (!current.has(action.redaction.id)) {
          return current;
        }

        const nextSelectedManualRedactionIds = new Set(current);
        nextSelectedManualRedactionIds.delete(action.redaction.id);
        return nextSelectedManualRedactionIds;
      });
      setBlackedOutManualRedactionIds((current) => {
        if (!current.has(action.redaction.id)) {
          return current;
        }

        const nextBlackedOut = new Set(current);
        nextBlackedOut.delete(action.redaction.id);
        return nextBlackedOut;
      });
      setActiveManualRedactionId((current) =>
        current === action.redaction.id ? null : current,
      );
    },
    [],
  );

  const restoreManualRedactionBlackout = useCallback(
    (
      action: Extract<
        HistoryAction,
        { kind: 'manual-redaction-blackout' }
      >,
    ) => {
      setBlackedOutManualRedactionIds((current) => {
        const nextBlackedOut = new Set(current);

        if (action.previousBlackedOut) {
          nextBlackedOut.add(action.redactionId);
        } else {
          nextBlackedOut.delete(action.redactionId);
        }

        return nextBlackedOut;
      });
    },
    [],
  );

  const applyManualRedactionBlackout = useCallback(
    (
      action: Extract<
        HistoryAction,
        { kind: 'manual-redaction-blackout' }
      >,
    ) => {
      setBlackedOutManualRedactionIds((current) => {
        const nextBlackedOut = new Set(current);

        if (action.nextBlackedOut) {
          nextBlackedOut.add(action.redactionId);
        } else {
          nextBlackedOut.delete(action.redactionId);
        }

        return nextBlackedOut;
      });
    },
    [],
  );

  const restoreManualRedactionCategoryChange = useCallback(
    (
      action: Extract<
        HistoryAction,
        { kind: 'manual-redaction-category-change' }
      >,
    ) => {
      setManualRedactions((current) =>
        current.map((redaction) =>
          redaction.id === action.redactionId
            ? { ...redaction, category: action.previousCategory }
            : redaction,
        ),
      );
    },
    [],
  );

  const applyManualRedactionCategoryChange = useCallback(
    (
      action: Extract<
        HistoryAction,
        { kind: 'manual-redaction-category-change' }
      >,
    ) => {
      setManualRedactions((current) =>
        current.map((redaction) =>
          redaction.id === action.redactionId
            ? { ...redaction, category: action.nextCategory }
            : redaction,
        ),
      );
    },
    [],
  );

  const updateManualRedactionBox = useCallback(
    (redactionId: string, boxIndex: number, box: TextBounds) => {
      setManualRedactions((current) =>
        current.map((redaction) => {
          if (redaction.id !== redactionId) {
            return redaction;
          }

          const nextBoxes = redaction.boxes.map((existing, index) =>
            index === boxIndex ? box : existing,
          );
          return { ...redaction, boxes: nextBoxes };
        }),
      );
    },
    [],
  );

  const restoreManualRedactionBoxUpdate = useCallback(
    (
      action: Extract<
        HistoryAction,
        { kind: 'manual-redaction-box-update' }
      >,
    ) => {
      updateManualRedactionBox(
        action.redactionId,
        action.boxIndex,
        action.previousBox,
      );
    },
    [updateManualRedactionBox],
  );

  const applyManualRedactionBoxUpdate = useCallback(
    (
      action: Extract<
        HistoryAction,
        { kind: 'manual-redaction-box-update' }
      >,
    ) => {
      updateManualRedactionBox(
        action.redactionId,
        action.boxIndex,
        action.nextBox,
      );
    },
    [updateManualRedactionBox],
  );

  const restorePageDeletion = useCallback(
    (action: Extract<HistoryAction, { kind: 'page-delete' }>) => {
      setDeletedPageNumbers((current) => {
        const nextDeletedPageNumbers = new Set(current);
        nextDeletedPageNumbers.delete(action.pageNumber);
        return nextDeletedPageNumbers;
      });
      setSelectedEntityIds((current) => {
        const nextSelectedEntityIds = new Set(current);
        action.selectedEntityIds.forEach((entityId) =>
          nextSelectedEntityIds.add(entityId),
        );
        return nextSelectedEntityIds;
      });
      setSelectedManualRedactionIds((current) => {
        const nextSelectedManualRedactionIds = new Set(current);
        action.selectedManualRedactionIds.forEach((redactionId) =>
          nextSelectedManualRedactionIds.add(redactionId),
        );
        return nextSelectedManualRedactionIds;
      });
      setActiveEntityId(action.activeEntityId);
      setActiveManualRedactionId(action.activeManualRedactionId);
      setCurrentPage(action.previousPage || action.pageNumber);
      window.requestAnimationFrame(() => scrollToPage(action.pageNumber));
    },
    [scrollToPage],
  );

  const applyPageDeletion = useCallback(
    (action: Extract<HistoryAction, { kind: 'page-delete' }>) => {
      setDeletedPageNumbers((current) => {
        const nextDeletedPageNumbers = new Set(current);
        nextDeletedPageNumbers.add(action.pageNumber);
        return nextDeletedPageNumbers;
      });
      setSelectedEntityIds((current) => {
        const nextSelectedEntityIds = new Set(current);
        action.selectedEntityIds.forEach((entityId) =>
          nextSelectedEntityIds.delete(entityId),
        );
        return nextSelectedEntityIds;
      });
      setSelectedManualRedactionIds((current) => {
        const nextSelectedManualRedactionIds = new Set(current);
        action.selectedManualRedactionIds.forEach((redactionId) =>
          nextSelectedManualRedactionIds.delete(redactionId),
        );
        return nextSelectedManualRedactionIds;
      });
      setActiveEntityId((current) =>
        current === action.activeEntityId ? null : current,
      );
      setActiveManualRedactionId((current) =>
        current === action.activeManualRedactionId ? null : current,
      );
      setCurrentPage((current) =>
        current === action.pageNumber ? action.nextPage : current,
      );

      if (action.nextPage > 0) {
        window.requestAnimationFrame(() => scrollToPage(action.nextPage));
      }
    },
    [scrollToPage],
  );

  const handleUndo = useCallback(() => {
    const action = undoStack[undoStack.length - 1];

    if (!action) {
      return;
    }

    switch (action.kind) {
      case 'entity-delete':
        restoreEntityDeletion(action);
        break;
      case 'entity-blackout':
        restoreEntityBlackout(action);
        break;
      case 'manual-redaction-create':
        restoreManualRedactionCreation(action);
        break;
      case 'manual-redaction-delete':
        restoreManualRedactionDeletion(action);
        break;
      case 'manual-redaction-blackout':
        restoreManualRedactionBlackout(action);
        break;
      case 'manual-redaction-category-change':
        restoreManualRedactionCategoryChange(action);
        break;
      case 'manual-redaction-box-update':
        restoreManualRedactionBoxUpdate(action);
        break;
      case 'page-delete':
        restorePageDeletion(action);
        break;
    }

    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, action]);
  }, [
    restoreEntityDeletion,
    restoreEntityBlackout,
    restoreManualRedactionBlackout,
    restoreManualRedactionBoxUpdate,
    restoreManualRedactionCategoryChange,
    restoreManualRedactionCreation,
    restoreManualRedactionDeletion,
    restorePageDeletion,
    undoStack,
  ]);

  const handleRedo = useCallback(() => {
    const action = redoStack[redoStack.length - 1];

    if (!action) {
      return;
    }

    switch (action.kind) {
      case 'entity-delete':
        applyEntityDeletion(action);
        break;
      case 'entity-blackout':
        applyEntityBlackout(action);
        break;
      case 'manual-redaction-create':
        applyManualRedactionCreation(action);
        break;
      case 'manual-redaction-delete':
        applyManualRedactionDeletion(action);
        break;
      case 'manual-redaction-blackout':
        applyManualRedactionBlackout(action);
        break;
      case 'manual-redaction-category-change':
        applyManualRedactionCategoryChange(action);
        break;
      case 'manual-redaction-box-update':
        applyManualRedactionBoxUpdate(action);
        break;
      case 'page-delete':
        applyPageDeletion(action);
        break;
    }

    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, action]);
  }, [
    applyEntityDeletion,
    applyEntityBlackout,
    applyManualRedactionBlackout,
    applyManualRedactionBoxUpdate,
    applyManualRedactionCategoryChange,
    applyManualRedactionCreation,
    applyManualRedactionDeletion,
    applyPageDeletion,
    redoStack,
  ]);

  const handleEntitySelect = useCallback(
    (entityId: string) => {
      const entity = visibleEntities.find((item) => item.id === entityId);

      // Compute the next selection from current state *before* the setter — the
      // updater callback does not run synchronously, so reading the result
      // inside it (to decide whether to scroll) would use a stale value.
      const willBeSelected = !selectedEntityIds.has(entityId);

      setActiveEntityId(entityId);
      setActiveManualRedactionId(null);
      setSelectedEntityIds((current) => {
        const nextSelectedEntityIds = new Set(current);

        if (nextSelectedEntityIds.has(entityId)) {
          nextSelectedEntityIds.delete(entityId);
        } else {
          nextSelectedEntityIds.add(entityId);
        }

        return nextSelectedEntityIds;
      });

      // Only scroll when selecting — on deselect the overlay is removed and
      // there is nothing to center on.
      if (entity && willBeSelected) {
        scrollToEntity(
          entity.pageNumber,
          entity.bbox,
          `[data-entity-id="${CSS.escape(entity.id)}"]`,
        );
      }
    },
    [scrollToEntity, selectedEntityIds, visibleEntities],
  );

  const handleEntityBlackout = useCallback(
    (entityId: string) => {
      if (!visibleEntities.some((entity) => entity.id === entityId)) {
        return;
      }

      const previousBlackedOut = blackedOutEntityIds.has(entityId);
      const nextBlackedOut = !previousBlackedOut;

      recordDeletionAction({
        kind: 'entity-blackout',
        entityId,
        previousBlackedOut,
        nextBlackedOut,
      });
      setActiveEntityId(entityId);
      setActiveManualRedactionId(null);
      setBlackedOutEntityIds((current) => {
        const nextBlackedOutEntityIds = new Set(current);

        if (nextBlackedOut) {
          nextBlackedOutEntityIds.add(entityId);
        } else {
          nextBlackedOutEntityIds.delete(entityId);
        }

        return nextBlackedOutEntityIds;
      });
    },
    [blackedOutEntityIds, recordDeletionAction, visibleEntities],
  );

  const handleManualRedactionBlackout = useCallback(
    (redactionId: string) => {
      if (!visibleManualRedactions.some((redaction) => redaction.id === redactionId)) {
        return;
      }

      const previousBlackedOut = blackedOutManualRedactionIds.has(redactionId);
      const nextBlackedOut = !previousBlackedOut;

      recordDeletionAction({
        kind: 'manual-redaction-blackout',
        redactionId,
        previousBlackedOut,
        nextBlackedOut,
      });
      setActiveEntityId(null);
      setActiveManualRedactionId(redactionId);
      setBlackedOutManualRedactionIds((current) => {
        const nextBlackedOutIds = new Set(current);

        if (nextBlackedOut) {
          nextBlackedOutIds.add(redactionId);
        } else {
          nextBlackedOutIds.delete(redactionId);
        }

        return nextBlackedOutIds;
      });
    },
    [
      blackedOutManualRedactionIds,
      recordDeletionAction,
      visibleManualRedactions,
    ],
  );

  const handleEntityTypeSelectionToggle = useCallback(
    (type: DetectedEntity['type'], shouldSelect: boolean) => {
      const entityIdsForType = visibleEntities
        .filter((entity) => entity.type === type)
        .map((entity) => entity.id);
      const manualRedactionIdsForType = visibleManualRedactions
        .filter((redaction) => redaction.category === type)
        .map((redaction) => redaction.id);

      setSelectedEntityIds((current) => {
        const nextSelectedEntityIds = new Set(current);

        entityIdsForType.forEach((entityId) => {
          if (shouldSelect) {
            nextSelectedEntityIds.add(entityId);
          } else {
            nextSelectedEntityIds.delete(entityId);
          }
        });

        return nextSelectedEntityIds;
      });

      setSelectedManualRedactionIds((current) => {
        const nextSelectedManualRedactionIds = new Set(current);

        manualRedactionIdsForType.forEach((redactionId) => {
          if (shouldSelect) {
            nextSelectedManualRedactionIds.add(redactionId);
          } else {
            nextSelectedManualRedactionIds.delete(redactionId);
          }
        });

        return nextSelectedManualRedactionIds;
      });

      if (!shouldSelect) {
        setActiveManualRedactionId((current) =>
          current && manualRedactionIdsForType.includes(current) ? null : current,
        );
      }
    },
    [visibleEntities, visibleManualRedactions],
  );

  const handleSearchResultSelect = useCallback(
    (match: SearchMatch) => {
      scrollToEntity(
        match.pageNumber,
        match.bbox,
        `[data-search-match-id="${CSS.escape(match.id)}"]`,
      );
    },
    [scrollToEntity],
  );

  const handleEntityDelete = useCallback(
    (entityId: string) => {
      const entity = visibleEntities.find((item) => item.id === entityId);

      if (!entity) {
        return;
      }

      recordDeletionAction({
        kind: 'entity-delete',
        entityId,
        wasActive: activeEntityId === entityId,
        wasSelected: selectedEntityIds.has(entityId),
        wasBlackedOut: blackedOutEntityIds.has(entityId),
      });
      setDeletedEntityIds((current) => {
        const nextDeletedEntityIds = new Set(current);
        nextDeletedEntityIds.add(entityId);
        return nextDeletedEntityIds;
      });
      setActiveEntityId((current) => (current === entityId ? null : current));
      setSelectedEntityIds((current) => {
        if (!current.has(entityId)) {
          return current;
        }

        const nextSelectedEntityIds = new Set(current);
        nextSelectedEntityIds.delete(entityId);
        return nextSelectedEntityIds;
      });
      setBlackedOutEntityIds((current) => {
        if (!current.has(entityId)) {
          return current;
        }

        const nextBlackedOutEntityIds = new Set(current);
        nextBlackedOutEntityIds.delete(entityId);
        return nextBlackedOutEntityIds;
      });
    },
    [
      activeEntityId,
      blackedOutEntityIds,
      recordDeletionAction,
      selectedEntityIds,
      visibleEntities,
    ],
  );

  const handleManualRedactionCreate = useCallback(
    (
      pageNumber: number,
      boxes: TextBounds[],
      text: string,
      source: ManualRedactionSource = 'text',
    ) => {
      if (boxes.length === 0) {
        return;
      }

      const redactionId = `manual-redaction-${pageNumber}-${Date.now()}`;
      const redaction: ManualRedaction = {
        id: redactionId,
        pageNumber,
        category: 'date',
        text: text.trim() || 'Manual redaction',
        boxes,
        source,
      };

      recordDeletionAction({
        kind: 'manual-redaction-create',
        redaction,
        index: manualRedactions.length,
        blackedOut: source === 'region',
        previousActiveEntityId: activeEntityId,
        previousActiveManualRedactionId: activeManualRedactionId,
      });
      setManualRedactions((current) => [...current, redaction]);
      setActiveEntityId(null);
      setActiveManualRedactionId(redactionId);
      setSelectedManualRedactionIds((current) => {
        const nextSelectedManualRedactionIds = new Set(current);
        nextSelectedManualRedactionIds.add(redactionId);
        return nextSelectedManualRedactionIds;
      });

      // A drawn region is a redaction by intent — black it out on create so it
      // exports as a solid rectangle. Text selections stay as highlights until
      // the user explicitly blacks them out.
      if (source === 'region') {
        setBlackedOutManualRedactionIds((current) => {
          const next = new Set(current);
          next.add(redactionId);
          return next;
        });
      }
    },
    [
      activeEntityId,
      activeManualRedactionId,
      manualRedactions.length,
      recordDeletionAction,
    ],
  );

  const handleManualRedactionSelect = useCallback(
    (redactionId: string | null) => {
      if (!redactionId) {
        setActiveManualRedactionId(null);
        return;
      }

      // Toggle: clicking the already-active redaction deselects it (clears the
      // active state) without deleting it. Compute from current state so the
      // scroll decision below doesn't rely on an async setter callback.
      const willBeActive = activeManualRedactionId !== redactionId;

      setActiveEntityId(null);
      setActiveManualRedactionId(willBeActive ? redactionId : null);
      setSelectedManualRedactionIds((current) => {
        const nextSelectedManualRedactionIds = new Set(current);

        if (nextSelectedManualRedactionIds.has(redactionId)) {
          nextSelectedManualRedactionIds.delete(redactionId);
        } else {
          nextSelectedManualRedactionIds.add(redactionId);
        }

        return nextSelectedManualRedactionIds;
      });

      const redaction = manualRedactions.find((item) => item.id === redactionId);

      // Only scroll when selecting — on deselect there's nothing to center on.
      if (redaction && willBeActive) {
        scrollToEntity(
          redaction.pageNumber,
          getUnionBox(redaction.boxes),
          `[data-redaction-id="${CSS.escape(redaction.id)}"]`,
        );
      }
    },
    [activeManualRedactionId, manualRedactions, scrollToEntity],
  );

  const handleManualRedactionCategoryChange = useCallback(
    (redactionId: string, category: EntityType) => {
      const redaction = manualRedactions.find((item) => item.id === redactionId);

      if (!redaction || redaction.category === category) {
        return;
      }

      recordDeletionAction({
        kind: 'manual-redaction-category-change',
        redactionId,
        previousCategory: redaction.category,
        nextCategory: category,
      });
      setManualRedactions((current) =>
        current.map((redaction) =>
          redaction.id === redactionId
            ? {
                ...redaction,
                category,
              }
            : redaction,
        ),
      );
    },
    [manualRedactions, recordDeletionAction],
  );

  const handleManualRedactionUpdateBox = useCallback(
    (redactionId: string, boxIndex: number, box: TextBounds) => {
      const redaction = manualRedactions.find((item) => item.id === redactionId);
      const previousBox = redaction?.boxes[boxIndex];

      if (!previousBox || boxesAreEqual(previousBox, box)) {
        return;
      }

      recordDeletionAction({
        kind: 'manual-redaction-box-update',
        redactionId,
        boxIndex,
        previousBox,
        nextBox: box,
      });
      updateManualRedactionBox(redactionId, boxIndex, box);
    },
    [manualRedactions, recordDeletionAction, updateManualRedactionBox],
  );

  const handleManualRedactionDelete = useCallback(
    (redactionId: string) => {
      const redaction = manualRedactions.find((item) => item.id === redactionId);

      if (!redaction) {
        return;
      }

      recordDeletionAction({
        kind: 'manual-redaction-delete',
        redaction,
        index: manualRedactions.findIndex((item) => item.id === redactionId),
        wasActive: activeManualRedactionId === redactionId,
        wasSelected: selectedManualRedactionIds.has(redactionId),
        wasBlackedOut: blackedOutManualRedactionIds.has(redactionId),
      });
      setManualRedactions((current) =>
        current.filter((item) => item.id !== redactionId),
      );
      setSelectedManualRedactionIds((current) => {
        if (!current.has(redactionId)) {
          return current;
        }

        const nextSelectedManualRedactionIds = new Set(current);
        nextSelectedManualRedactionIds.delete(redactionId);
        return nextSelectedManualRedactionIds;
      });
      setBlackedOutManualRedactionIds((current) => {
        if (!current.has(redactionId)) {
          return current;
        }

        const next = new Set(current);
        next.delete(redactionId);
        return next;
      });
      setActiveManualRedactionId((current) =>
        current === redactionId ? null : current,
      );
    },
    [
      activeManualRedactionId,
      blackedOutManualRedactionIds,
      manualRedactions,
      recordDeletionAction,
      selectedManualRedactionIds,
    ],
  );

  const handlePageDelete = useCallback(
    (pageNumber: number) => {
      if (visiblePageNumbers.length <= 1) {
        setExportError('At least one page must remain.');
        return;
      }

      setExportError(null);

      const nextVisiblePage =
        visiblePageNumbers.find((candidate) => candidate > pageNumber) ??
        [...visiblePageNumbers]
          .reverse()
          .find((candidate) => candidate < pageNumber) ??
        0;
      const entityIdsOnPage = visibleEntities
        .filter((entity) => entity.pageNumber === pageNumber)
        .map((entity) => entity.id);
      const manualRedactionIdsOnPage = visibleManualRedactions
        .filter((redaction) => redaction.pageNumber === pageNumber)
        .map((redaction) => redaction.id);
      const selectedEntityIdsOnPage = entityIdsOnPage.filter((entityId) =>
        selectedEntityIds.has(entityId),
      );
      const selectedManualRedactionIdsOnPage = manualRedactionIdsOnPage.filter(
        (redactionId) => selectedManualRedactionIds.has(redactionId),
      );
      const activeEntityIdOnPage =
        activeEntityId && entityIdsOnPage.includes(activeEntityId)
          ? activeEntityId
          : null;
      const activeManualRedactionIdOnPage =
        activeManualRedactionId &&
        manualRedactionIdsOnPage.includes(activeManualRedactionId)
          ? activeManualRedactionId
          : null;

      recordDeletionAction({
        kind: 'page-delete',
        pageNumber,
        previousPage: currentPage,
        nextPage: nextVisiblePage,
        activeEntityId: activeEntityIdOnPage,
        activeManualRedactionId: activeManualRedactionIdOnPage,
        selectedEntityIds: selectedEntityIdsOnPage,
        selectedManualRedactionIds: selectedManualRedactionIdsOnPage,
      });
      pageRefs.current.delete(pageNumber);
      setDeletedPageNumbers((current) => {
        const nextDeletedPageNumbers = new Set(current);
        nextDeletedPageNumbers.add(pageNumber);
        return nextDeletedPageNumbers;
      });
      setCurrentPage((current) =>
        current === pageNumber ? nextVisiblePage : current,
      );
      setActiveEntityId((current) =>
        current && entityIdsOnPage.includes(current) ? null : current,
      );
      setActiveManualRedactionId((current) =>
        current && manualRedactionIdsOnPage.includes(current) ? null : current,
      );
      setSelectedEntityIds((current) => {
        const nextSelectedEntityIds = new Set(current);
        entityIdsOnPage.forEach((entityId) => nextSelectedEntityIds.delete(entityId));
        return nextSelectedEntityIds;
      });
      setSelectedManualRedactionIds((current) => {
        const nextSelectedManualRedactionIds = new Set(current);
        manualRedactionIdsOnPage.forEach((redactionId) =>
          nextSelectedManualRedactionIds.delete(redactionId),
        );
        return nextSelectedManualRedactionIds;
      });

      if (nextVisiblePage > 0) {
        window.requestAnimationFrame(() => scrollToPage(nextVisiblePage));
      }
    },
    [
      activeEntityId,
      activeManualRedactionId,
      currentPage,
      recordDeletionAction,
      scrollToPage,
      selectedEntityIds,
      selectedManualRedactionIds,
      visibleEntities,
      visibleManualRedactions,
      visiblePageNumbers,
    ],
  );

  const selectedEntities = visibleEntities.filter((entity) =>
    selectedEntityIds.has(entity.id),
  );
  const blackedOutEntities = visibleEntities.filter((entity) =>
    blackedOutEntityIds.has(entity.id),
  );
  const highlightedEntities = visibleEntities.filter(
    (entity) =>
      selectedEntityIds.has(entity.id) || blackedOutEntityIds.has(entity.id),
  );
  // A manual redaction is shown/exported if it is selected OR blacked out.
  const selectedManualRedactions = visibleManualRedactions.filter(
    (redaction) =>
      selectedManualRedactionIds.has(redaction.id) ||
      blackedOutManualRedactionIds.has(redaction.id),
  );
  const blackedOutManualRedactions = visibleManualRedactions.filter(
    (redaction) => blackedOutManualRedactionIds.has(redaction.id),
  );
  const hasDeletedRemainingPages =
    deletedPageNumbers.size > 0 && visiblePageNumbers.length > 0;
  const hasDownloadableHighlights =
    selectedEntities.length > 0 ||
    blackedOutEntities.length > 0 ||
    selectedManualRedactions.length > 0 ||
    hasDeletedRemainingPages;

  const handleHighlightedPdfDownload = useCallback(async () => {
    if (!originalPdfBytes || !hasDownloadableHighlights) {
      return;
    }

    setIsExportingHighlightedPdf(true);
    setExportError(null);

    try {
      const measuredPdfBoxes = pdfDocument
        ? await measurePdfHighlightBoxes(pdfDocument, selectedEntities)
        : new Map<string, TextBounds[]>();
      const measuredManualPdfBoxes = pdfDocument
        ? await measureManualRedactionPdfBoxes(
            pdfDocument,
            selectedManualRedactions,
          )
        : new Map<string, TextBounds[]>();
      const measuredBlackoutPdfBoxes = pdfDocument
        ? await measurePdfHighlightBoxes(pdfDocument, blackedOutEntities)
        : new Map<string, TextBounds[]>();
      const highlightedPdfBytes = await exportHighlightedPdf(
        originalPdfBytes,
        selectedEntities,
        measuredPdfBoxes,
        selectedManualRedactions,
        measuredManualPdfBoxes,
        blackedOutEntities,
        measuredBlackoutPdfBoxes,
        blackedOutManualRedactionIds,
        deletedPageNumbers,
        pdfDocument,
      );
      const highlightedPdfBuffer = highlightedPdfBytes.buffer.slice(
        highlightedPdfBytes.byteOffset,
        highlightedPdfBytes.byteOffset + highlightedPdfBytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([highlightedPdfBuffer], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = getHighlightedFileName(fileName);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      console.error('Could not export highlighted PDF.', error);
      setExportError('Could not download highlighted PDF.');
    } finally {
      setIsExportingHighlightedPdf(false);
    }
  }, [
    blackedOutEntities,
    blackedOutManualRedactionIds,
    fileName,
    hasDownloadableHighlights,
    deletedPageNumbers,
    originalPdfBytes,
    pdfDocument,
    selectedEntities,
    selectedManualRedactions,
  ]);

  useEffect(() => {
    if (!activeEntityId) {
      return;
    }

    window.requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-entity-row-id="${CSS.escape(activeEntityId)}"]`,
      );

      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
    });
  }, [activeEntityId]);

  useEffect(() => {
    if (!activeManualRedactionId) {
      return;
    }

    window.requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-manual-redaction-row-id="${CSS.escape(activeManualRedactionId)}"]`,
      );

      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
    });
  }, [activeManualRedactionId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKeyboardTarget(event.target)) {
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (
          !isKeyboardDeleteTarget(
            event.target,
            activeEntityId,
            activeManualRedactionId,
          )
        ) {
          return;
        }

        if (activeManualRedactionId) {
          event.preventDefault();
          handleManualRedactionDelete(activeManualRedactionId);
          return;
        }

        if (activeEntityId) {
          event.preventDefault();
          handleEntityDelete(activeEntityId);
          return;
        }
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        if (
          (event.key === 'Enter' || event.key === ' ') &&
          activeEntityId &&
          !(event.target instanceof HTMLElement && event.target.closest('button'))
        ) {
          event.preventDefault();
          handleEntitySelect(activeEntityId);
        }

        return;
      }

      if (keyboardNavigationEntities.length === 0) {
        return;
      }

      event.preventDefault();

      const currentIndex = keyboardNavigationEntities.findIndex(
        (item) =>
          (item.kind === 'entity' && item.entity.id === activeEntityId) ||
          (item.kind === 'manual-redaction' &&
            item.redaction.id === activeManualRedactionId),
      );
      const nextIndex =
        currentIndex === -1
          ? event.key === 'ArrowRight'
            ? 0
            : keyboardNavigationEntities.length - 1
          : (currentIndex +
              (event.key === 'ArrowRight' ? 1 : -1) +
              keyboardNavigationEntities.length) %
            keyboardNavigationEntities.length;
      const nextItem = keyboardNavigationEntities[nextIndex];

      if (nextItem.kind === 'entity') {
        setActiveEntityId(nextItem.entity.id);
        setActiveManualRedactionId(null);
        // Select the item we navigate to so its highlight overlay renders — an
        // active-but-unselected entity has no overlay, so the viewer would have
        // nothing to emphasize or scroll to.
        setSelectedEntityIds((current) => {
          if (current.has(nextItem.entity.id)) {
            return current;
          }

          const next = new Set(current);
          next.add(nextItem.entity.id);
          return next;
        });
        scrollToEntity(
          nextItem.entity.pageNumber,
          nextItem.entity.bbox,
          `[data-entity-id="${CSS.escape(nextItem.entity.id)}"]`,
        );
      } else {
        setActiveEntityId(null);
        setActiveManualRedactionId(nextItem.redaction.id);
        setSelectedManualRedactionIds((current) => {
          if (current.has(nextItem.redaction.id)) {
            return current;
          }

          const next = new Set(current);
          next.add(nextItem.redaction.id);
          return next;
        });
        scrollToEntity(
          nextItem.redaction.pageNumber,
          getUnionBox(nextItem.redaction.boxes),
          `[data-redaction-id="${CSS.escape(nextItem.redaction.id)}"]`,
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeEntityId,
    activeManualRedactionId,
    handleEntityDelete,
    handleEntitySelect,
    handleManualRedactionDelete,
    keyboardNavigationEntities,
    scrollToEntity,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        shouldIgnoreKeyboardTarget(event.target) ||
        event.key.toLowerCase() !== 'z' ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRedo, handleUndo]);

  // The live editing snapshot, recomputed each render so it is always current
  // and available synchronously (not just after the passive report effect).
  const editSnapshot = useMemo<DocumentEditState>(
    () => ({
      currentPage,
      deletedPageNumbers,
      deletedEntityIds,
      activeEntityId,
      selectedEntityIds,
      blackedOutEntityIds,
      manualRedactions,
      selectedManualRedactionIds,
      blackedOutManualRedactionIds,
      activeManualRedactionId,
      undoStack,
      redoStack,
    }),
    [
      currentPage,
      deletedPageNumbers,
      deletedEntityIds,
      activeEntityId,
      selectedEntityIds,
      blackedOutEntityIds,
      manualRedactions,
      selectedManualRedactionIds,
      blackedOutManualRedactionIds,
      activeManualRedactionId,
      undoStack,
      redoStack,
    ],
  );

  // Keep a ref to the latest snapshot so an external consumer (e.g. "Download
  // All") can read the active document's current edits synchronously, before
  // the passive report effect below has flushed them into the queue.
  const editSnapshotRef = useRef(editSnapshot);
  if (stateDocumentId === documentId) {
    editSnapshotRef.current = editSnapshot;
  }

  // Register a synchronous getter so App can flush this document's latest edits
  // into the queue right before a batch export, closing the stale-mirror gap.
  // Keyed by `stateDocumentId` (the document the local state currently belongs
  // to) rather than `documentId`, so it is always registered against the doc
  // whose data `editSnapshotRef` holds — there is no unregistered window during
  // a document switch (the previous doc stays registered until the reset runs).
  useEffect(() => {
    onProvideEditSnapshot(stateDocumentId, () => editSnapshotRef.current);

    return () => onProvideEditSnapshot(stateDocumentId, null);
  }, [stateDocumentId, onProvideEditSnapshot]);

  // Report the live editing state up to the document queue so each PDF keeps
  // its own selections, redactions, deletions and history across switches.
  // (Search state is intentionally ephemeral and not persisted.) Only reports
  // once the local state actually belongs to the current document.
  useEffect(() => {
    if (stateDocumentId !== documentId) {
      return;
    }

    onEditStateChange(documentId, editSnapshot);
  }, [onEditStateChange, documentId, editSnapshot, stateDocumentId]);

  useEffect(() => {
    const query = searchQuery.trim();
    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;

    if (!pdfDocument || searchMode !== 'document' || !query) {
      setSearchMatches([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const timeoutId = window.setTimeout(() => {
      searchPdfText(pdfDocument, query)
        .then((matches) => {
          if (searchRunRef.current === runId) {
            setSearchMatches(matches);
          }
        })
        .catch(() => {
          if (searchRunRef.current === runId) {
            setSearchMatches([]);
            setSearchError('Document search failed for this PDF.');
          }
        })
        .finally(() => {
          if (searchRunRef.current === runId) {
            setIsSearching(false);
          }
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [pdfDocument, searchMode, searchQuery]);

  useEffect(() => {
    const viewerNode = viewerRef.current;

    if (!viewerNode || pageCount === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visiblePage = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

        if (!visiblePage) {
          return;
        }

        const pageNumber = Number(
          (visiblePage.target as HTMLElement).dataset.pageNumber,
        );

        if (Number.isFinite(pageNumber)) {
          setCurrentPage(pageNumber);
        }
      },
      {
        root: viewerNode,
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0.2, 0.4, 0.6, 0.8],
      },
    );

    pageRefs.current.forEach((pageNode) => observer.observe(pageNode));

    return () => observer.disconnect();
  }, [pageCount, pdfDocument, visiblePageNumbers]);

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="topbar-left">
          <div className="app-brand">
            <div className="app-brand-icon" aria-hidden="true">
              PDF
            </div>
            <div>
              <h1 id="app-title">PDF Redaction Assistant</h1>
              <p>
                {fileName} · {pageCount} {pageCount === 1 ? 'page' : 'pages'} ·{' '}
                {entities.length} entities detected
              </p>
            </div>
          </div>

          <ColorLegend />
        </div>

        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-white/15 text-white text-sm font-semibold backdrop-blur-sm hover:bg-white/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            disabled={
              !(Boolean(originalPdfBytes) && hasDownloadableHighlights) ||
              isExportingHighlightedPdf
            }
            onClick={handleHighlightedPdfDownload}
          >
            <Download className="w-4 h-4" />
            {isExportingHighlightedPdf ? 'Exporting...' : 'Download Current'}
          </button>
          {documentTabs.length > 1 && (
            <button
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-white text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              disabled={isExportingAll}
              onClick={onDownloadAll}
            >
              <Download className="w-4 h-4" />
              {isExportingAll ? 'Zipping...' : `Download All (${documentTabs.length})`}
            </button>
          )}
          <FileUpload
            fileName={fileName}
            pageCount={pageCount}
            isLoading={isLoading}
            error={error}
            onFilesSelected={onFilesSelected}
          />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      {documentTabs.length > 1 && (
        <nav
          className="flex min-h-11 items-center gap-2 overflow-x-auto bg-gray-50 border-b border-gray-200 px-3 py-1.5"
          aria-label="Open documents"
        >
          {documentTabs.map((tab) => {
            const isActiveTab = tab.id === documentId;
            const tabLabel = getDocumentTabLabel(tab.fileName);

            return (
              <div
                key={tab.id}
                className={`group flex h-8 w-64 shrink-0 items-center gap-1.5 rounded-md pl-3 pr-1.5 text-sm whitespace-nowrap transition-colors ${
                  isActiveTab
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <button
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5"
                  type="button"
                  title={tab.fileName}
                  onClick={() => onSelectDocument(tab.id)}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left leading-8">
                    {tabLabel}
                  </span>
                  {tab.edited && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                      aria-label="Edited"
                    />
                  )}
                </button>
                <button
                  className="grid place-items-center w-5 h-5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  type="button"
                  aria-label={`Close ${tab.fileName}`}
                  onClick={() => onRemoveDocument(tab.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </nav>
      )}

      <div className="workspace-grid">
        <ThumbnailPanel
          activePage={currentPage}
          pageCount={pageCount}
          pdfDocument={pdfDocument}
          visiblePageNumbers={visiblePageNumbers}
          onThumbnailClick={scrollToPage}
          onPageDelete={handlePageDelete}
        />

        <section className="workspace" aria-labelledby="app-title">
          <PdfViewer
            fileName={fileName}
            pageCount={pageCount}
            currentPage={currentPage}
            visiblePageNumbers={visiblePageNumbers}
            pdfDocument={pdfDocument}
            registerPageRef={registerPageRef}
            onJumpToPage={scrollToPage}
            selectedEntities={highlightedEntities}
            activeEntity={activeEntity}
            blackedOutEntityIds={blackedOutEntityIds}
            onEntityBlackout={handleEntityBlackout}
            manualRedactions={selectedManualRedactions}
            activeManualRedactionId={activeManualRedactionId}
            blackedOutManualRedactionIds={blackedOutManualRedactionIds}
            onManualRedactionBlackout={handleManualRedactionBlackout}
            searchMatches={visibleSearchMatches}
            viewerRef={viewerRef}
            hasDocument={hasDocument}
            isLoading={isLoading}
            error={error}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canDownloadHighlightedPdf={
              Boolean(originalPdfBytes) && hasDownloadableHighlights
            }
            isExportingHighlightedPdf={isExportingHighlightedPdf}
            exportError={exportError}
            onDownloadHighlightedPdf={handleHighlightedPdfDownload}
            onManualRedactionCreate={handleManualRedactionCreate}
            onManualRedactionSelect={handleManualRedactionSelect}
            onManualRedactionCategoryChange={
              handleManualRedactionCategoryChange
            }
            onManualRedactionUpdateBox={handleManualRedactionUpdateBox}
            onManualRedactionDelete={handleManualRedactionDelete}
          />
        </section>

        <EntityPanel
          entities={visibleEntities}
          error={entityError}
          isLoading={isLoading}
          searchMode={searchMode}
          searchQuery={searchQuery}
          searchMatches={visibleSearchMatches}
          searchError={searchError}
          isSearching={isSearching}
          activeEntityId={activeEntityId}
          selectedEntityIds={selectedEntityIds}
          manualRedactions={visibleManualRedactions}
          activeManualRedactionId={activeManualRedactionId}
          selectedManualRedactionIds={selectedManualRedactionIds}
          onSearchModeChange={setSearchMode}
          onSearchQueryChange={setSearchQuery}
          onEntitySelect={handleEntitySelect}
          onEntityDelete={handleEntityDelete}
          onEntityTypeSelectionToggle={handleEntityTypeSelectionToggle}
          onManualRedactionSelect={handleManualRedactionSelect}
          onManualRedactionDelete={handleManualRedactionDelete}
          onSearchResultSelect={handleSearchResultSelect}
        />
      </div>
    </main>
  );
}

function getUnionBox(boxes: TextBounds[]): TextBounds | null {
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

function getDocumentTabLabel(fileName: string) {
  return fileName.replace(/\.pdf$/i, '');
}

function boxesAreEqual(first: TextBounds, second: TextBounds) {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  );
}

function isKeyboardDeleteTarget(
  target: EventTarget | null,
  activeEntityId: string | null,
  activeManualRedactionId: string | null,
) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (activeManualRedactionId) {
    const manualTarget = target.closest<HTMLElement>(
      '[data-manual-redaction-row-id], [data-redaction-id]',
    );

    return (
      manualTarget?.dataset.manualRedactionRowId === activeManualRedactionId ||
      manualTarget?.dataset.redactionId === activeManualRedactionId
    );
  }

  if (activeEntityId) {
    const entityTarget = target.closest<HTMLElement>(
      '[data-entity-row-id], [data-entity-id]',
    );

    return (
      entityTarget?.dataset.entityRowId === activeEntityId ||
      entityTarget?.dataset.entityId === activeEntityId
    );
  }

  return false;
}

function shouldIgnoreKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}

export default Layout;
