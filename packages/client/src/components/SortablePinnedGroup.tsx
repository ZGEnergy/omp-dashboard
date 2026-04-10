import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@mdi/react";
import { mdiDragHorizontalVariant } from "@mdi/js";

interface Props {
  id: string;
  children: React.ReactNode;
}

export function SortablePinnedGroup({ id, children }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: "pinned-group" } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
  };

  return (
    <div ref={setNodeRef} style={style} className="group/pinned-sortable" data-testid="sortable-pinned-group">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-0 h-8 w-4 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover/pinned-sortable:opacity-60 transition-opacity z-10"
        data-testid="drag-handle-pinned"
        onClick={(e) => e.stopPropagation()}
      >
        <Icon path={mdiDragHorizontalVariant} size={0.45} className="text-[var(--text-tertiary)]" />
      </div>
      {children}
    </div>
  );
}
