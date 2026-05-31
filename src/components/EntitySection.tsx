import { useEffect, useState } from 'react';
import { Calendar, ChevronDown, ChevronRight, Trash2, User } from 'lucide-react';
import EntityRow from './EntityRow';
import type { DetectedEntity, EntityType, ManualRedaction } from '../types/entity';

type EntitySectionProps = {
  entities: DetectedEntity[];
  manualRedactions: ManualRedaction[];
  allEntities: DetectedEntity[];
  allManualRedactions: ManualRedaction[];
  totalCount: number;
  defaultExpanded: boolean;
  activeEntityId: string | null;
  selectedEntityIds: ReadonlySet<string>;
  selectedManualRedactionIds: ReadonlySet<string>;
  activeManualRedactionId: string | null;
  type: EntityType;
  onEntitySelect: (entityId: string) => void;
  onEntityDelete: (entityId: string) => void;
  onEntityTypeSelectionToggle: (
    type: EntityType,
    shouldSelect: boolean,
  ) => void;
  onManualRedactionSelect: (redactionId: string | null) => void;
  onManualRedactionDelete: (redactionId: string) => void;
};

const sectionLabels: Record<EntityType, string> = {
  date: 'Dates',
  name: 'Person Names',
};

const sectionIcons: Record<EntityType, typeof Calendar> = {
  date: Calendar,
  name: User,
};

const sectionIconColors: Record<EntityType, string> = {
  date: 'bg-amber-100 text-amber-700',
  name: 'bg-blue-100 text-blue-700',
};

function EntitySection({
  entities,
  manualRedactions,
  allEntities,
  allManualRedactions,
  totalCount,
  defaultExpanded,
  activeEntityId,
  selectedEntityIds,
  selectedManualRedactionIds,
  activeManualRedactionId,
  type,
  onEntitySelect,
  onEntityDelete,
  onEntityTypeSelectionToggle,
  onManualRedactionSelect,
  onManualRedactionDelete,
}: EntitySectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const sectionLabel = sectionLabels[type];
  const SectionIcon = sectionIcons[type];
  const hasSelectableRows = allEntities.length > 0 || allManualRedactions.length > 0;
  const hasRows = entities.length > 0 || manualRedactions.length > 0;
  const shownCount = entities.length + manualRedactions.length;
  const areAllSelected =
    hasSelectableRows &&
    allEntities.every((entity) => selectedEntityIds.has(entity.id)) &&
    allManualRedactions.every((redaction) =>
      selectedManualRedactionIds.has(redaction.id),
    );
  const selectionButtonLabel = areAllSelected ? 'Clear all' : 'Select all';
  const countLabel =
    shownCount === totalCount
      ? `${totalCount} found`
      : `${shownCount} shown of ${totalCount}`;

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  return (
    <section className="border-b border-gray-200 last:border-0" data-entity-type={type}>
      <div className="flex items-center justify-between pr-3">
        <button
          aria-expanded={isExpanded}
          className="flex-1 min-w-0 p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span className={`grid place-items-center w-9 h-9 rounded-xl ${sectionIconColors[type]}`} aria-hidden="true">
            <SectionIcon className="w-4 h-4" />
          </span>
          <span className="text-left min-w-0">
            <span className="block text-sm font-medium text-gray-800 tracking-tight">{sectionLabel}</span>
            <span className="block text-[0.7rem] uppercase tracking-wider text-gray-400 mt-0.5">{countLabel}</span>
          </span>
        </button>
        <span className="flex items-center gap-2 shrink-0">
          <span className="grid place-items-center min-w-6 h-6 px-1.5 rounded-full bg-gray-100 text-xs font-bold text-gray-600 font-mono">
            {totalCount}
          </span>
          <button
            className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!hasSelectableRows}
            type="button"
            onClick={() => onEntityTypeSelectionToggle(type, !areAllSelected)}
          >
            {selectionButtonLabel}
          </button>
          <span className="text-gray-400" aria-hidden="true">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </span>
        </span>
      </div>

      {isExpanded && (
        hasRows ? (
          <div className="px-2 pb-2 space-y-1">
            {entities.map((entity) => (
              <EntityRow
                entity={entity}
                isActive={activeEntityId === entity.id}
                isSelected={selectedEntityIds.has(entity.id)}
                key={entity.id}
                onSelect={() => onEntitySelect(entity.id)}
                onDelete={() => onEntityDelete(entity.id)}
              />
            ))}
            {manualRedactions.map((redaction) => {
              const isSelected = selectedManualRedactionIds.has(redaction.id);
              const isActive = activeManualRedactionId === redaction.id;

              return (
                <div
                  className={`group flex items-start gap-2 rounded-lg px-3 py-2 transition-all ${
                    isSelected
                      ? isActive
                        ? 'bg-blue-100 ring-2 ring-blue-400 shadow-sm'
                        : 'bg-blue-50'
                      : 'hover:bg-gray-100'
                  }`}
                  key={redaction.id}
                >
                  <button
                    aria-current={isActive ? 'true' : undefined}
                    aria-pressed={isSelected}
                    aria-selected={isSelected}
                    className="flex-1 min-w-0 text-left focus:outline-none focus-visible:outline-none"
                    data-manual-redaction-row-id={redaction.id}
                    type="button"
                    onClick={() => onManualRedactionSelect(redaction.id)}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-blue-600 text-xs w-3 shrink-0" aria-hidden="true">
                          {isSelected ? '✓' : ''}
                        </span>
                        <span
                          className={`text-sm font-medium break-all ${
                            isSelected && isActive
                              ? 'text-blue-900'
                              : 'text-gray-700'
                          }`}
                        >
                          {redaction.text}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-xs px-1.5 py-0.5 rounded border ${
                          isSelected && isActive
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        p.{redaction.pageNumber}
                      </span>
                    </span>
                    <span className="block text-xs text-gray-400 mt-0.5 pl-[1.125rem]">
                      Manual {type === 'date' ? 'date' : 'name'}
                    </span>
                  </button>
                  <button
                    aria-label={`Delete manual redaction for ${redaction.text}`}
                    className="grid place-items-center h-6 w-6 rounded hover:bg-red-50 transition-colors"
                    type="button"
                    onClick={() => onManualRedactionDelete(redaction.id)}
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-4 text-sm text-gray-500">
            {totalCount > 0
              ? `No matching ${sectionLabel.toLowerCase()}`
              : `No ${sectionLabel.toLowerCase()} detected`}
          </p>
        )
      )}
    </section>
  );
}

export default EntitySection;
