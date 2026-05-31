import { useMemo } from 'react';
import { Search } from 'lucide-react';
import EntitySection from './EntitySection';
import type {
  DetectedEntity,
  EntityType,
  ManualRedaction,
  SearchMatch,
} from '../types/entity';

type SearchMode = 'entity' | 'document';

type EntityPanelProps = {
  entities: DetectedEntity[];
  error: string | null;
  isLoading: boolean;
  searchMode: SearchMode;
  searchQuery: string;
  searchMatches: SearchMatch[];
  searchError: string | null;
  isSearching: boolean;
  activeEntityId: string | null;
  selectedEntityIds: ReadonlySet<string>;
  selectedManualRedactionIds: ReadonlySet<string>;
  manualRedactions: ManualRedaction[];
  activeManualRedactionId: string | null;
  onSearchModeChange: (mode: SearchMode) => void;
  onSearchQueryChange: (query: string) => void;
  onEntitySelect: (entityId: string) => void;
  onEntityDelete: (entityId: string) => void;
  onEntityTypeSelectionToggle: (
    type: EntityType,
    shouldSelect: boolean,
  ) => void;
  onManualRedactionSelect: (redactionId: string | null) => void;
  onManualRedactionDelete: (redactionId: string) => void;
  onSearchResultSelect: (match: SearchMatch) => void;
};

const entityTypes: EntityType[] = ['date', 'name'];

function matchesSearch(entity: DetectedEntity, searchTerm: string) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return (
    entity.text.toLowerCase().includes(normalizedSearch) ||
    entity.type.includes(normalizedSearch) ||
    String(entity.pageNumber).includes(normalizedSearch)
  );
}

function manualRedactionMatchesSearch(
  redaction: ManualRedaction,
  searchTerm: string,
) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return (
    redaction.text.toLowerCase().includes(normalizedSearch) ||
    redaction.category.includes(normalizedSearch) ||
    String(redaction.pageNumber).includes(normalizedSearch)
  );
}

function EntityPanel({
  entities,
  error,
  isLoading,
  searchMode,
  searchQuery,
  searchMatches,
  searchError,
  isSearching,
  activeEntityId,
  selectedEntityIds,
  selectedManualRedactionIds,
  manualRedactions,
  activeManualRedactionId,
  onSearchModeChange,
  onSearchQueryChange,
  onEntitySelect,
  onEntityDelete,
  onEntityTypeSelectionToggle,
  onManualRedactionSelect,
  onManualRedactionDelete,
  onSearchResultSelect,
}: EntityPanelProps) {
  const activeQuery = searchQuery.trim();
  const filteredEntities = useMemo(
    () =>
      searchMode === 'entity'
        ? entities.filter((entity) => matchesSearch(entity, searchQuery))
        : entities,
    [entities, searchMode, searchQuery],
  );
  const filteredManualRedactions = useMemo(
    () =>
      searchMode === 'entity'
        ? manualRedactions.filter((redaction) =>
            manualRedactionMatchesSearch(redaction, searchQuery),
          )
        : manualRedactions,
    [manualRedactions, searchMode, searchQuery],
  );
  const entityCounts = useMemo(
    () => ({
      date:
        entities.filter((entity) => entity.type === 'date').length +
        manualRedactions.filter((redaction) => redaction.category === 'date')
          .length,
      name:
        entities.filter((entity) => entity.type === 'name').length +
        manualRedactions.filter((redaction) => redaction.category === 'name')
          .length,
    }),
    [entities, manualRedactions],
  );
  const entitiesByType = useMemo(
    () => ({
      date: entities.filter((entity) => entity.type === 'date'),
      name: entities.filter((entity) => entity.type === 'name'),
    }),
    [entities],
  );
  const manualRedactionsByType = useMemo(
    () => ({
      date: manualRedactions.filter((redaction) => redaction.category === 'date'),
      name: manualRedactions.filter((redaction) => redaction.category === 'name'),
    }),
    [manualRedactions],
  );
  const hasActiveEntityFilter = searchMode === 'entity' && activeQuery.length > 0;
  const hasDocumentSearch = searchMode === 'document' && activeQuery.length > 0;
  const filteredEntityCount =
    filteredEntities.length + filteredManualRedactions.length;
  const searchPlaceholder =
    searchMode === 'entity'
      ? 'Filter dates, names, or page'
      : 'Find text across document';

  return (
    <aside
      className="w-80 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden"
      aria-label="Detected entities"
    >
      <div className="px-4 py-4 border-b border-gray-200">
        <p className="text-[0.7rem] uppercase tracking-wider text-gray-400 font-medium">
          Review Panel
        </p>
        <div className="flex items-center justify-between mt-1">
          <h2 className="font-semibold text-gray-800 text-base tracking-tight">
            Detected Entities
          </h2>
          <span className="grid place-items-center min-w-6 h-6 px-1.5 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
            {entities.length + manualRedactions.length}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Click any item to highlight in document
        </p>
      </div>

      <div className="p-3 border-b border-gray-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            placeholder={searchPlaceholder}
            type="search"
            value={searchQuery}
            className="w-full pl-9 pr-3 h-9 text-sm rounded-md border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-gray-100" aria-label="Search mode">
          <button
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              searchMode === 'entity'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            type="button"
            onClick={() => onSearchModeChange('entity')}
          >
            Entity only
          </button>
          <button
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              searchMode === 'document'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            type="button"
            onClick={() => onSearchModeChange('document')}
          >
            Find all
          </button>
        </div>
        {activeQuery && (
          <button
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            type="button"
            onClick={() => onSearchQueryChange('')}
          >
            Clear search
          </button>
        )}
        {hasActiveEntityFilter && (
          <p className="text-xs text-gray-500">{filteredEntityCount} filtered results</p>
        )}
      </div>

      {hasDocumentSearch && (
        <section className="border-b border-gray-200" aria-label="Document search results">
          <div className="px-4 py-2 flex items-center justify-between bg-gray-50 text-xs font-semibold text-gray-600">
            <span>
              {isSearching
                ? 'Searching...'
                : `${searchMatches.length} ${
                    searchMatches.length === 1 ? 'match' : 'matches'
                  }`}
            </span>
            <button
              className="text-blue-600 hover:text-blue-700 font-medium"
              type="button"
              onClick={() => onSearchQueryChange('')}
            >
              Clear
            </button>
          </div>
          {searchError && (
            <p className="px-4 py-3 text-sm text-red-600">{searchError}</p>
          )}
          {!isSearching && !searchError && searchMatches.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-500">No text matches found.</p>
          )}
          {searchMatches.length > 0 && (
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
              {searchMatches.map((match, index) => (
                <button
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between gap-2"
                  key={match.id}
                  type="button"
                  onClick={() => onSearchResultSelect(match)}
                >
                  <span className="text-sm text-gray-700 truncate">{match.text}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    Page {match.pageNumber} · #{index + 1}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {isLoading && (
        <p className="px-4 py-3 text-sm text-gray-500">Reading text from the PDF...</p>
      )}
      {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="flex-1 overflow-y-auto">
      {entityTypes.map((type) => (
        <EntitySection
          entities={filteredEntities.filter((entity) => entity.type === type)}
          manualRedactions={filteredManualRedactions.filter(
            (redaction) => redaction.category === type,
          )}
          allEntities={entitiesByType[type]}
          allManualRedactions={manualRedactionsByType[type]}
          defaultExpanded={searchMode === 'entity'}
          key={type}
          totalCount={entityCounts[type]}
          activeEntityId={activeEntityId}
          selectedEntityIds={selectedEntityIds}
          selectedManualRedactionIds={selectedManualRedactionIds}
          activeManualRedactionId={activeManualRedactionId}
          type={type}
          onEntitySelect={onEntitySelect}
          onEntityDelete={onEntityDelete}
          onEntityTypeSelectionToggle={onEntityTypeSelectionToggle}
          onManualRedactionSelect={onManualRedactionSelect}
          onManualRedactionDelete={onManualRedactionDelete}
        />
      ))}
      </div>
    </aside>
  );
}

export default EntityPanel;
