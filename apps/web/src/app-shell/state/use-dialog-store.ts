"use client";

import { create } from 'zustand';
import type { FileUIPart } from "ai";
import type { AgentChatMode } from '@/features/agent/types/index';

export interface QueuedAgentPrompt {
  id: string;
  prompt: string;
  displayPrompt?: string;
  attachmentPaths?: string[];
  files?: (FileUIPart & { id: string })[];
  workspaceId?: string | null;
  projectId?: string | null;
  mode: AgentChatMode;
  instanceKey?: string | null;
  registryId?: string;
  forceNewSession?: boolean;
  sessionTitle?: string;
  origin: string;
  createdAt: number;
}

type AgentPromptQueueMap = Record<string, QueuedAgentPrompt[]>;
type AgentChatDraftMap = Record<string, string>;

export function getAgentPromptQueueKey(
  workspaceId: string | null | undefined,
  projectId: string | null | undefined,
  _mode: AgentChatMode,
  instanceKey?: string | null,
): string {
  const contextKey = workspaceId
    ? `workspace:${workspaceId}`
    : projectId
      ? `project:${projectId}`
      : "temp";
  const instance = instanceKey?.trim();
  return instance ? `${contextKey}:instance:${instance}` : contextKey;
}

export function buildQueuedAgentPromptContent(prompt: string, attachmentPaths?: string[]): string {
  if (!attachmentPaths || attachmentPaths.length === 0) return prompt;
  const attachmentInfo = attachmentPaths.map((path) => `- ${path}`).join("\n");
  return `${prompt}\n\n[Attached files have been saved to the following paths, please read them to understand the content:]\n${attachmentInfo}`;
}

function createQueuedAgentPromptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `queued-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface DialogStore {
  isCreateProjectOpen: boolean;
  setCreateProjectOpen: (open: boolean) => void;
  
  isCreateWorkspaceOpen: boolean;
  setCreateWorkspaceOpen: (open: boolean) => void;
  
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;

  /** One-shot: onboarding/import asks LeftSidebar to highlight this project, then clears. */
  pendingSidebarProjectId: string | null;
  setPendingSidebarProjectId: (id: string | null) => void;
  
  isGlobalSearchOpen: boolean;
  setGlobalSearchOpen: (open: boolean) => void;
  globalSearchTab: 'app' | 'files' | 'code';
  setGlobalSearchTab: (tab: 'app' | 'files' | 'code') => void;

  pendingAgentChatMode: AgentChatMode | null;
  setPendingAgentChatMode: (mode: AgentChatMode | null) => void;
  peekPendingAgentChatMode: () => AgentChatMode | null;
  consumePendingAgentChatMode: () => AgentChatMode | null;

  agentChatPromptQueues: AgentPromptQueueMap;
  agentChatDrafts: AgentChatDraftMap;
  enqueueAgentChatPrompt: (data: Omit<QueuedAgentPrompt, "id" | "createdAt">) => string;
  getAgentChatDraft: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
    instanceKey?: string | null,
  ) => string;
  setAgentChatDraft: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
    value: string,
    instanceKey?: string | null,
  ) => void;
  appendAgentChatDraft: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
    value: string,
    instanceKey?: string | null,
  ) => void;
  clearAgentChatDraft: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
    instanceKey?: string | null,
  ) => void;
  peekQueuedAgentChatPrompt: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
    instanceKey?: string | null,
  ) => QueuedAgentPrompt | null;
  shiftQueuedAgentChatPrompt: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
    instanceKey?: string | null,
  ) => QueuedAgentPrompt | null;
  removeQueuedAgentChatPrompt: (id: string) => void;
  updateQueuedAgentChatPrompt: (
    id: string,
    patch: Partial<Pick<QueuedAgentPrompt, "prompt" | "displayPrompt" | "sessionTitle" | "registryId" | "forceNewSession">>,
  ) => void;
  moveQueuedAgentChatPrompt: (id: string, toIndex: number) => void;
  moveQueuedAgentChatPromptUp: (id: string) => void;
  moveQueuedAgentChatPromptDown: (id: string) => void;

  isCodeReviewDialogOpen: boolean;
  setCodeReviewDialogOpen: (open: boolean) => void;

  headerHasOpenOverlay: boolean;
  setHeaderHasOpenOverlay: (open: boolean) => void;
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  isCreateProjectOpen: false,
  setCreateProjectOpen: (open) => set({ isCreateProjectOpen: open }),
  
  isCreateWorkspaceOpen: false,
  setCreateWorkspaceOpen: (open) => set({ isCreateWorkspaceOpen: open }),
  
  selectedProjectId: '',
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),

  pendingSidebarProjectId: null,
  setPendingSidebarProjectId: (id) => set({ pendingSidebarProjectId: id }),
  
  isGlobalSearchOpen: false,
  setGlobalSearchOpen: (open) => set({ isGlobalSearchOpen: open }),
  globalSearchTab: 'app',
  setGlobalSearchTab: (tab) => set({ globalSearchTab: tab }),

  pendingAgentChatMode: null,
  setPendingAgentChatMode: (mode) => set({ pendingAgentChatMode: mode }),
  peekPendingAgentChatMode: () => {
    return get().pendingAgentChatMode;
  },
  consumePendingAgentChatMode: () => {
    let mode: AgentChatMode | null = null;
    set((state) => {
      mode = state.pendingAgentChatMode;
      return { pendingAgentChatMode: null };
    });
    return mode;
  },

  agentChatPromptQueues: {},
  agentChatDrafts: {},
  enqueueAgentChatPrompt: (data) => {
    const item: QueuedAgentPrompt = {
      ...data,
      id: createQueuedAgentPromptId(),
      createdAt: Date.now(),
    };
    set((state) => {
      const queueKey = getAgentPromptQueueKey(
        item.workspaceId,
        item.projectId,
        item.mode,
        item.instanceKey,
      );
      const existing = state.agentChatPromptQueues[queueKey] ?? [];
      return {
        agentChatPromptQueues: {
          ...state.agentChatPromptQueues,
          [queueKey]: [...existing, item],
        },
      };
    });
    return item.id;
  },
  getAgentChatDraft: (workspaceId, projectId, mode, instanceKey) => {
    return get().agentChatDrafts[
      getAgentPromptQueueKey(workspaceId, projectId, mode, instanceKey)
    ] ?? "";
  },
  setAgentChatDraft: (workspaceId, projectId, mode, value, instanceKey) => set((state) => ({
    agentChatDrafts: {
      ...state.agentChatDrafts,
      [getAgentPromptQueueKey(workspaceId, projectId, mode, instanceKey)]: value,
    },
  })),
  appendAgentChatDraft: (workspaceId, projectId, mode, value, instanceKey) => set((state) => {
    const key = getAgentPromptQueueKey(workspaceId, projectId, mode, instanceKey);
    const existing = state.agentChatDrafts[key]?.trim();
    const nextValue = existing ? `${existing}\n\n${value}` : value;
    return {
      agentChatDrafts: {
        ...state.agentChatDrafts,
        [key]: nextValue,
      },
    };
  }),
  clearAgentChatDraft: (workspaceId, projectId, mode, instanceKey) => set((state) => {
    const key = getAgentPromptQueueKey(workspaceId, projectId, mode, instanceKey);
    if (!(key in state.agentChatDrafts)) return state;
    const nextDrafts = { ...state.agentChatDrafts };
    delete nextDrafts[key];
    return { agentChatDrafts: nextDrafts };
  }),
  peekQueuedAgentChatPrompt: (workspaceId, projectId, mode, instanceKey) => {
    const queueKey = getAgentPromptQueueKey(workspaceId, projectId, mode, instanceKey);
    return get().agentChatPromptQueues[queueKey]?.[0] ?? null;
  },
  shiftQueuedAgentChatPrompt: (workspaceId, projectId, mode, instanceKey) => {
    let item: QueuedAgentPrompt | null = null;
    set((state) => {
      const queueKey = getAgentPromptQueueKey(workspaceId, projectId, mode, instanceKey);
      const queue = state.agentChatPromptQueues[queueKey] ?? [];
      item = queue[0] ?? null;
      if (!item) return state;
      const nextQueue = queue.slice(1);
      const nextQueues = { ...state.agentChatPromptQueues };
      if (nextQueue.length > 0) {
        nextQueues[queueKey] = nextQueue;
      } else {
        delete nextQueues[queueKey];
      }
      return { agentChatPromptQueues: nextQueues };
    });
    return item;
  },
  removeQueuedAgentChatPrompt: (id) => set((state) => {
    const nextQueues: AgentPromptQueueMap = {};
    for (const [queueKey, queue] of Object.entries(state.agentChatPromptQueues)) {
      const nextQueue = queue.filter((item) => item.id !== id);
      if (nextQueue.length > 0) nextQueues[queueKey] = nextQueue;
    }
    return { agentChatPromptQueues: nextQueues };
  }),
  updateQueuedAgentChatPrompt: (id, patch) => set((state) => {
    const nextQueues: AgentPromptQueueMap = {};
    for (const [queueKey, queue] of Object.entries(state.agentChatPromptQueues)) {
      const nextQueue = queue.map((item) => {
        if (item.id !== id) return item;
        if (typeof patch.prompt !== "string") {
          return { ...item, ...patch };
        }
        const displayPrompt = patch.displayPrompt ?? patch.prompt;
        return {
          ...item,
          ...patch,
          displayPrompt,
          prompt: buildQueuedAgentPromptContent(patch.prompt, item.attachmentPaths),
        };
      });
      if (nextQueue.length > 0) nextQueues[queueKey] = nextQueue;
    }
    return { agentChatPromptQueues: nextQueues };
  }),
  moveQueuedAgentChatPrompt: (id, toIndex) => set((state) => {
    const nextQueues: AgentPromptQueueMap = {};
    for (const [queueKey, queue] of Object.entries(state.agentChatPromptQueues)) {
      const fromIndex = queue.findIndex((item) => item.id === id);
      if (fromIndex < 0) {
        if (queue.length > 0) nextQueues[queueKey] = queue;
        continue;
      }
      const boundedIndex = Math.max(0, Math.min(toIndex, queue.length - 1));
      if (fromIndex === boundedIndex) {
        nextQueues[queueKey] = queue;
        continue;
      }
      const nextQueue = [...queue];
      const [item] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(boundedIndex, 0, item);
      nextQueues[queueKey] = nextQueue;
    }
    return { agentChatPromptQueues: nextQueues };
  }),
  moveQueuedAgentChatPromptUp: (id) => set((state) => {
    const nextQueues: AgentPromptQueueMap = {};
    for (const [queueKey, queue] of Object.entries(state.agentChatPromptQueues)) {
      const fromIndex = queue.findIndex((item) => item.id === id);
      if (fromIndex <= 0) {
        if (queue.length > 0) nextQueues[queueKey] = queue;
        continue;
      }
      const nextQueue = [...queue];
      [nextQueue[fromIndex - 1], nextQueue[fromIndex]] = [nextQueue[fromIndex], nextQueue[fromIndex - 1]];
      nextQueues[queueKey] = nextQueue;
    }
    return { agentChatPromptQueues: nextQueues };
  }),
  moveQueuedAgentChatPromptDown: (id) => set((state) => {
    const nextQueues: AgentPromptQueueMap = {};
    for (const [queueKey, queue] of Object.entries(state.agentChatPromptQueues)) {
      const fromIndex = queue.findIndex((item) => item.id === id);
      if (fromIndex < 0 || fromIndex >= queue.length - 1) {
        if (queue.length > 0) nextQueues[queueKey] = queue;
        continue;
      }
      const nextQueue = [...queue];
      [nextQueue[fromIndex], nextQueue[fromIndex + 1]] = [nextQueue[fromIndex + 1], nextQueue[fromIndex]];
      nextQueues[queueKey] = nextQueue;
    }
    return { agentChatPromptQueues: nextQueues };
  }),

  isCodeReviewDialogOpen: false,
  setCodeReviewDialogOpen: (open) => set({ isCodeReviewDialogOpen: open }),

  headerHasOpenOverlay: false,
  setHeaderHasOpenOverlay: (open) => set({ headerHasOpenOverlay: open }),
}));
