"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const AGENT_CHAT_TAB_PREFIX = "agent-chat:";

export type AgentChatCenterTab = {
  id: string;
  value: string;
  contextId: string;
  chatId: string | null;
  title: string;
  cwd: string;
  providerId: string | null;
  openedAt: number;
};

export const EMPTY_AGENT_CHAT_TABS: AgentChatCenterTab[] = [];

type AgentChatCenterTabsStore = {
  tabsByContext: Record<string, AgentChatCenterTab[]>;
  pendingActivate: { contextId: string; value: string } | null;
  pendingNewChat: number;
  openTab: (input: {
    contextId: string;
    chatId: string;
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
  }) => AgentChatCenterTab;
  openDraftTab: (input: { contextId: string; title?: string | null }) => AgentChatCenterTab;
  bindChat: (input: {
    contextId: string;
    value: string;
    chatId: string;
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
  }) => void;
  patchChat: (input: {
    contextId: string;
    chatId: string;
    title?: string | null;
    providerId?: string | null;
    cwd?: string;
  }) => void;
  closeTab: (contextId: string, value: string) => void;
  requestActivate: (contextId: string, value: string) => void;
  clearPendingActivate: () => void;
  requestNewChat: () => void;
  consumePendingNewChat: () => boolean;
};

export function buildAgentChatTabValue(chatId: string): string {
  return `${AGENT_CHAT_TAB_PREFIX}${chatId}`;
}

export function isAgentChatTabValue(value: string | null | undefined): value is string {
  return !!value && value.startsWith(AGENT_CHAT_TAB_PREFIX);
}

export function parseAgentChatTabValue(value: string | null | undefined): string | null {
  if (!isAgentChatTabValue(value)) return null;
  return value.slice(AGENT_CHAT_TAB_PREFIX.length) || null;
}

export const useAgentChatCenterTabsStore = create<AgentChatCenterTabsStore>()(
  persist(
    (set, get) => ({
      tabsByContext: {},
      pendingActivate: null,
      pendingNewChat: 0,
      openTab: ({ contextId, chatId, title, cwd, providerId }) => {
        const value = buildAgentChatTabValue(chatId);
        const existing = (get().tabsByContext[contextId] ?? []).find((tab) => tab.value === value);
        if (existing) return existing;
        const tab: AgentChatCenterTab = {
          id: value,
          value,
          contextId,
          chatId,
          title: title?.trim() || "Chat",
          cwd: cwd ?? "",
          providerId: providerId ?? null,
          openedAt: Date.now(),
        };
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: [...(state.tabsByContext[contextId] ?? []), tab],
          },
        }));
        return tab;
      },
      openDraftTab: ({ contextId, title }) => {
        const draftId =
          globalThis.crypto?.randomUUID?.() ??
          `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const value = buildAgentChatTabValue(`draft:${draftId}`);
        const existing = (get().tabsByContext[contextId] ?? []).find((tab) => tab.value === value);
        if (existing) return existing;
        const tab: AgentChatCenterTab = {
          id: value,
          value,
          contextId,
          chatId: null,
          title: title?.trim() || "Chat",
          cwd: "",
          providerId: null,
          openedAt: Date.now(),
        };
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: [...(state.tabsByContext[contextId] ?? []), tab],
          },
        }));
        return tab;
      },
      bindChat: ({ contextId, value, chatId, title, cwd, providerId }) => {
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: (state.tabsByContext[contextId] ?? []).map((tab) =>
              tab.value === value
                ? {
                    ...tab,
                    chatId,
                    title: title?.trim() || tab.title,
                    cwd: cwd ?? tab.cwd,
                    providerId: providerId ?? tab.providerId,
                  }
                : tab,
            ),
          },
        }));
      },
      patchChat: ({ contextId, chatId, title, providerId, cwd }) => {
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: (state.tabsByContext[contextId] ?? []).map((tab) =>
              tab.chatId === chatId
                ? {
                    ...tab,
                    title: title?.trim() || tab.title,
                    cwd: cwd ?? tab.cwd,
                    providerId: providerId ?? tab.providerId,
                  }
                : tab,
            ),
          },
        }));
      },
      closeTab: (contextId, value) => {
        const tabs = get().tabsByContext[contextId] ?? [];
        const next = tabs.filter((tab) => tab.value !== value);
        if (next.length === tabs.length) return;
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: next,
          },
        }));
      },
      requestActivate: (contextId, value) => {
        set({ pendingActivate: { contextId, value } });
      },
      clearPendingActivate: () => set({ pendingActivate: null }),
      requestNewChat: () => set((state) => ({ pendingNewChat: state.pendingNewChat + 1 })),
      consumePendingNewChat: () => {
        if (get().pendingNewChat <= 0) return false;
        set((state) => ({ pendingNewChat: Math.max(0, state.pendingNewChat - 1) }));
        return true;
      },
    }),
    {
      name: "atmos-agent-chat-center-tabs",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ tabsByContext: state.tabsByContext }),
    },
  ),
);
