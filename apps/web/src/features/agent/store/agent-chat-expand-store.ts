import { useCallback } from "react";
import { create } from "zustand";

type ExpandMap = Record<string, boolean>;

interface AgentChatExpandStore {
  values: ExpandMap;
  setExpand: (key: string, value: boolean) => void;
  reset: () => void;
}

export const useAgentChatExpandStore = create<AgentChatExpandStore>((set, get) => ({
  values: {},
  setExpand: (key, value) => {
    if (get().values[key] === value) return;
    set((state) => ({ values: { ...state.values, [key]: value } }));
  },
  reset: () => {
    if (Object.keys(get().values).length === 0) return;
    set({ values: {} });
  },
}));

export function useAgentChatExpand(
  key: string,
  fallback: boolean,
): [boolean, (next: boolean) => void] {
  const stored = useAgentChatExpandStore((state) => state.values[key]);
  const setExpand = useAgentChatExpandStore((state) => state.setExpand);
  const onChange = useCallback((next: boolean) => {
    setExpand(key, next);
  }, [key, setExpand]);
  return [stored ?? fallback, onChange];
}

export function agentChatProcessExpandKey(messageId: string): string {
  return `process:${messageId}`;
}

export function agentChatInspectExpandKey(messageId: string): string {
  return `inspect:${messageId}`;
}

export function agentChatToolGroupExpandKey(messageId: string, groupKey: string): string {
  return `group:${messageId}:${groupKey}`;
}

export function agentChatToolExpandKey(toolCallId: string): string {
  return `tool:${toolCallId}`;
}

export function agentChatPlanExpandKey(scope: string): string {
  return `plan:${scope}`;
}

/** User bubble expanded past the three-line / paste-chip collapse. */
export function agentChatUserBodyExpandKey(entryId: string): string {
  return `user-body:${entryId}`;
}

/** User bubble selected: time + copy row visible in the bottom-right. */
export function agentChatUserMetaExpandKey(entryId: string): string {
  return `user-meta:${entryId}`;
}
