"use client";

import React, { createContext, useContext, useMemo } from "react";
import {
  displayToolPath,
  displayToolTitle,
} from "@/features/agent/lib/tool-results/parse-tool-result";

const AgentChatCwdContext = createContext<string | null>(null);

export function AgentChatCwdProvider({
  cwd,
  children,
}: {
  cwd?: string | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const trimmed = cwd?.trim();
    return trimmed ? trimmed : null;
  }, [cwd]);
  return (
    <AgentChatCwdContext.Provider value={value}>
      {children}
    </AgentChatCwdContext.Provider>
  );
}

export function useAgentChatCwd(): string | null {
  return useContext(AgentChatCwdContext);
}

export function useDisplayToolPath() {
  const cwd = useAgentChatCwd();
  return useMemo(() => {
    return (path: string) => displayToolPath(path, cwd);
  }, [cwd]);
}

export function useDisplayToolTitle() {
  const cwd = useAgentChatCwd();
  return useMemo(() => {
    return (title: string, path?: string | null) => displayToolTitle(title, cwd, path);
  }, [cwd]);
}
