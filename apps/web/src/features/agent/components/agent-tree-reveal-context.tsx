"use client";

import { createContext, useContext, type ReactNode } from "react";

const AgentTreeRevealContext = createContext(false);

export function AgentTreeRevealProvider({
  reveal,
  children,
}: {
  reveal: boolean;
  children: ReactNode;
}) {
  return (
    <AgentTreeRevealContext.Provider value={reveal}>
      {children}
    </AgentTreeRevealContext.Provider>
  );
}

export function useAgentTreeReveal(): boolean {
  return useContext(AgentTreeRevealContext);
}
