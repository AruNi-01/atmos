"use client";

import React, { createContext, useContext, useMemo } from "react";
import {
  displayToolPath,
  displayToolTitle,
  normalizeFsPath,
} from "@/features/agent/lib/tool-results/parse-tool-result";

type AgentChatCwdContextValue = {
  cwd: string | null;
  roots: string[];
};

const EMPTY_CWD: AgentChatCwdContextValue = { cwd: null, roots: [] };

const AgentChatCwdContext = createContext<AgentChatCwdContextValue>(EMPTY_CWD);

function uniqueRoots(paths: (string | null | undefined)[]): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const normalized = normalizeFsPath(path);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    roots.push(normalized);
  }
  return roots;
}

export function AgentChatCwdProvider({
  cwd,
  projectOrWorkspacePath,
  children,
}: {
  cwd?: string | null;
  projectOrWorkspacePath?: string | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const trimmed = cwd?.trim() || null;
    return {
      cwd: trimmed,
      roots: uniqueRoots([trimmed, projectOrWorkspacePath]),
    };
  }, [cwd, projectOrWorkspacePath]);
  return (
    <AgentChatCwdContext.Provider value={value}>
      {children}
    </AgentChatCwdContext.Provider>
  );
}

export function useAgentChatCwd(): string | null {
  return useContext(AgentChatCwdContext).cwd;
}

export function useAgentChatPathRoots(): string[] {
  return useContext(AgentChatCwdContext).roots;
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
