"use client";

import React from "react";
import {
  cn,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@workspace/ui";

type TerminalPaneDragHandleValue = {
  setNodeRef: (node: HTMLElement | null) => void;
  listeners?: DraggableSyntheticListeners;
  attributes?: DraggableAttributes;
  isDragging: boolean;
  dragEnabled: boolean;
};

const TerminalPaneDragHandleContext =
  React.createContext<TerminalPaneDragHandleValue | null>(null);

export function TerminalPaneDragHandleProvider({
  value,
  children,
}: {
  value: TerminalPaneDragHandleValue;
  children: React.ReactNode;
}) {
  return (
    <TerminalPaneDragHandleContext.Provider value={value}>
      {children}
    </TerminalPaneDragHandleContext.Provider>
  );
}

/** Title-side drag handle. No-ops when the split view has only one pane. */
export function TerminalPaneDragHandle({
  className,
  label,
  children,
}: {
  className?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const dnd = React.useContext(TerminalPaneDragHandleContext);
  if (!dnd?.dragEnabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={dnd.setNodeRef}
      className={cn("touch-none", className)}
      data-pane-drag-handle=""
      aria-label={label}
      {...dnd.attributes}
      {...dnd.listeners}
    >
      {children}
    </div>
  );
}
