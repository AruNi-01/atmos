"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";

export type SubagentOverlayContextValue = {
  selectedId: string | null;
  open: (id: string) => void;
  close: () => void;
};

const SubagentOverlayContext = createContext<SubagentOverlayContextValue | null>(null);

const NOOP: SubagentOverlayContextValue = {
  selectedId: null,
  open: () => {},
  close: () => {},
};

export function SubagentOverlayProvider({
  selectedId,
  onSelect,
  children,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const open = useCallback(
    (id: string) => {
      onSelect(selectedId === id ? null : id);
    },
    [onSelect, selectedId],
  );
  const close = useCallback(() => onSelect(null), [onSelect]);
  const value = useMemo(
    () => ({ selectedId, open, close }),
    [selectedId, open, close],
  );
  return (
    <SubagentOverlayContext.Provider value={value}>
      {children}
    </SubagentOverlayContext.Provider>
  );
}

export function useSubagentOverlay(): SubagentOverlayContextValue {
  return useContext(SubagentOverlayContext) ?? NOOP;
}
