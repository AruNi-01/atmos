"use client";

import { createContext, useContext, type ReactNode } from "react";

const AgentPermissionHistoryContext = createContext(false);

export function AgentPermissionHistoryProvider({ children }: { children: ReactNode }) {
  return (
    <AgentPermissionHistoryContext.Provider value={true}>
      {children}
    </AgentPermissionHistoryContext.Provider>
  );
}

export function useHistoricPermissionParts() {
  return useContext(AgentPermissionHistoryContext);
}
