import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { DetectedEntity } from '../types/entity';

type EntityRowProps = {
  entity: DetectedEntity;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
};

function EntityRow({
  entity,
  isActive,
  isSelected,
  onSelect,
  onDelete,
}: EntityRowProps) {
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();

    const rowRect = rowRef.current?.getBoundingClientRect();

    setMenuPosition({
      x: rowRect ? event.clientX - rowRect.left : event.clientX,
      y: rowRect ? event.clientY - rowRect.top : event.clientY,
    });
  };

  useEffect(() => {
    if (!menuPosition) {
      return;
    }

    const closeMenu = () => setMenuPosition(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuPosition]);

  return (
    <div
      className="relative"
      ref={rowRef}
      onContextMenu={handleContextMenu}
    >
      <button
        aria-current={isActive ? 'true' : undefined}
        aria-pressed={isSelected}
        aria-selected={isSelected}
        className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 ${
          isSelected
            ? isActive
              ? 'bg-blue-100 ring-2 ring-blue-400 shadow-sm'
              : 'bg-blue-50'
            : 'hover:bg-gray-100'
        }`}
        data-active={isActive}
        data-entity-row-id={entity.id}
        data-selected={isSelected}
        type="button"
        onClick={onSelect}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-blue-600 text-xs w-3 shrink-0" aria-hidden="true">
              {isSelected ? '✓' : ''}
            </span>
            <span
              className={`text-sm font-medium break-all ${
                isSelected && isActive ? 'text-blue-900' : 'text-gray-700'
              }`}
            >
              {entity.text}
            </span>
          </span>
          <span
            className={`shrink-0 text-xs px-1.5 py-0.5 rounded border ${
              isSelected && isActive
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-gray-200 text-gray-500'
            }`}
          >
            p.{entity.pageNumber}
          </span>
        </span>
        <span className="block text-xs text-gray-400 mt-0.5 pl-[1.125rem]">
          {entity.type}
        </span>
      </button>

      {menuPosition && (
        <div
          className="absolute z-20 min-w-28 rounded-lg border border-gray-200 bg-white p-1 shadow-xl"
          style={{ left: menuPosition.x, top: menuPosition.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            type="button"
            onClick={() => {
              setMenuPosition(null);
              onDelete();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default EntityRow;
