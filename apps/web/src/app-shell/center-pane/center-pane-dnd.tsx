"use client";

import React from "react";
import {
  cn,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@workspace/ui";

type CenterPaneDragHandleValue = {
  setNodeRef: (node: HTMLElement | null) => void;
  listeners?: DraggableSyntheticListeners;
  attributes?: DraggableAttributes;
  isDragging: boolean;
  dragEnabled: boolean;
};

const CenterPaneDragHandleContext =
  React.createContext<CenterPaneDragHandleValue | null>(null);

export function CenterPaneDragHandleProvider({
  value,
  children,
}: {
  value: CenterPaneDragHandleValue;
  children: React.ReactNode;
}) {
  return (
    <CenterPaneDragHandleContext.Provider value={value}>
      {children}
    </CenterPaneDragHandleContext.Provider>
  );
}

/**
 * Full pane-header drag handle (the top chrome, not individual tabs).
 * Interactive children should use pointer-events-auto + stopPropagation.
 */
export function CenterPaneDragHandle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const dnd = React.useContext(CenterPaneDragHandleContext);
  if (!dnd?.dragEnabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={dnd.setNodeRef}
      className={cn("relative cursor-grab touch-none active:cursor-grabbing", className)}
      data-center-pane-drag-handle=""
      {...dnd.attributes}
      {...dnd.listeners}
    >
      {children}
    </div>
  );
}
