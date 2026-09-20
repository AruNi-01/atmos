"use client";

import React, { createContext, useContext } from "react";

const AssistantProcessInspectContext = createContext<(() => void) | null>(null);

/** Marks that the user expanded a tool / process section (skip auto-collapse on settle). */
export function AssistantProcessInspectProvider({
  onInspect,
  children,
}: {
  onInspect: () => void;
  children: React.ReactNode;
}) {
  return (
    <AssistantProcessInspectContext.Provider value={onInspect}>
      {children}
    </AssistantProcessInspectContext.Provider>
  );
}

export function useMarkAssistantProcessInspecting(): () => void {
  return useContext(AssistantProcessInspectContext) ?? (() => {});
}
