"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const AGENT_CHAT_TAB_PREFIX = "agent-chat:";

export type AgentChatCenterTab = {
  id: string;
  value: string;
  contextId: string;
  conversationId: string | null;
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
    conversationId: string;
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
  }) => AgentChatCenterTab;
  openDraftTab: (input: { contextId: string; title?: string | null }) => AgentChatCenterTab;
  bindConversation: (input: {
    contextId: string;
    value: string;
    conversationId: string;
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
  }) => void;
  patchConversation: (input: {
    contextId: string;
    conversationId: string;
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

export function buildAgentChatTabValue(conversationId: string): string {
  return `${AGENT_CHAT_TAB_PREFIX}${conversationId}`;
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
      openTab: ({ contextId, conversationId, title, cwd, providerId }) => {
        const value = buildAgentChatTabValue(conversationId);
        const existing = (get().tabsByContext[contextId] ?? []).find((tab) => tab.value === value);
        if (existing) return existing;
        const tab: AgentChatCenterTab = {
          id: value,
          value,
          contextId,
          conversationId,
          title: title?.trim() || "Agent Chat",
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
          conversationId: null,
          title: title?.trim() || "Agent Chat",
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
      bindConversation: ({ contextId, value, conversationId, title, cwd, providerId }) => {
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: (state.tabsByContext[contextId] ?? []).map((tab) =>
              tab.value === value
                ? {
                    ...tab,
                    conversationId,
                    title: title?.trim() || tab.title,
                    cwd: cwd ?? tab.cwd,
                    providerId: providerId ?? tab.providerId,
                  }
                : tab,
            ),
          },
        }));
      },
      patchConversation: ({ contextId, conversationId, title, providerId, cwd }) => {
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: (state.tabsByContext[contextId] ?? []).map((tab) =>
              tab.conversationId === conversationId
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
