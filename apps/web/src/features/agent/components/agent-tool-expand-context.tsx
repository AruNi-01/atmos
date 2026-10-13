"use client";

import { createContext, useContext, type ReactNode } from "react";

const AgentToolExpandIdContext = createContext<string | null>(null);

export function AgentToolExpandIdProvider({
  toolCallId,
  children,
}: {
  toolCallId: string;
  children: ReactNode;
}) {
  return (
    <AgentToolExpandIdContext.Provider value={toolCallId}>
      {children}
    </AgentToolExpandIdContext.Provider>
  );
}

export function useAgentToolExpandId(): string | null {
  return useContext(AgentToolExpandIdContext);
}
