"use client";

import * as React from "react";
import type { TLShapeId } from "tldraw";

import type { TerminalRef } from "@/features/terminal/components/Terminal";

const CanvasTerminalRefContext = React.createContext<
  React.MutableRefObject<Map<TLShapeId, TerminalRef>> | null
>(null);

export function CanvasTerminalRefProvider({ children }: { children: React.ReactNode }) {
  const refs = React.useRef(new Map<TLShapeId, TerminalRef>());
  return (
    <CanvasTerminalRefContext.Provider value={refs}>{children}</CanvasTerminalRefContext.Provider>
  );
}

export function useCanvasTerminalRefs() {
  return React.useContext(CanvasTerminalRefContext);
}

export function registerCanvasTerminalRef(
  map: React.MutableRefObject<Map<TLShapeId, TerminalRef>> | null,
  shapeId: TLShapeId,
  ref: TerminalRef | null,
) {
  if (!map) return;
  if (ref) {
    map.current.set(shapeId, ref);
  } else {
    map.current.delete(shapeId);
  }
}
