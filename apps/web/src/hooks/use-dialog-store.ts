"use client";

import { create } from 'zustand';
import type { FileUIPart } from "ai";
import type { AgentChatMode } from '@/types/agent-chat';

export interface QueuedAgentPrompt {
  id: string;
  prompt: string;
  displayPrompt?: string;
  attachmentPaths?: string[];
  files?: (FileUIPart & { id: string })[];
  workspaceId?: string | null;
  projectId?: string | null;
  mode: AgentChatMode;
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
  mode: AgentChatMode,
): string {
  if (workspaceId) return `workspace:${workspaceId}:${mode}`;
  if (projectId) return `project:${projectId}:${mode}`;
  return `temp:${mode}`;
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
  ) => string;
  setAgentChatDraft: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
    value: string,
  ) => void;
  appendAgentChatDraft: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
    value: string,
  ) => void;
  clearAgentChatDraft: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
  ) => void;
  peekQueuedAgentChatPrompt: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
  ) => QueuedAgentPrompt | null;
  shiftQueuedAgentChatPrompt: (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    mode: AgentChatMode,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeActionRun: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setActiveActionRun: (run: any | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activePr: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setActivePr: (pr: any | null) => void;
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  isCreateProjectOpen: false,
  setCreateProjectOpen: (open) => set({ isCreateProjectOpen: open }),
  
  isCreateWorkspaceOpen: false,
  setCreateWorkspaceOpen: (open) => set({ isCreateWorkspaceOpen: open }),
  
  selectedProjectId: '',
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  
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
      const queueKey = getAgentPromptQueueKey(item.workspaceId, item.projectId, item.mode);
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
  getAgentChatDraft: (workspaceId, projectId, mode) => {
    return get().agentChatDrafts[getAgentPromptQueueKey(workspaceId, projectId, mode)] ?? "";
  },
  setAgentChatDraft: (workspaceId, projectId, mode, value) => set((state) => ({
    agentChatDrafts: {
      ...state.agentChatDrafts,
      [getAgentPromptQueueKey(workspaceId, projectId, mode)]: value,
    },
  })),
  appendAgentChatDraft: (workspaceId, projectId, mode, value) => set((state) => {
    const key = getAgentPromptQueueKey(workspaceId, projectId, mode);
    const existing = state.agentChatDrafts[key]?.trim();
    const nextValue = existing ? `${existing}\n\n${value}` : value;
    return {
      agentChatDrafts: {
        ...state.agentChatDrafts,
        [key]: nextValue,
      },
    };
  }),
  clearAgentChatDraft: (workspaceId, projectId, mode) => set((state) => {
    const key = getAgentPromptQueueKey(workspaceId, projectId, mode);
    if (!(key in state.agentChatDrafts)) return state;
    const nextDrafts = { ...state.agentChatDrafts };
    delete nextDrafts[key];
    return { agentChatDrafts: nextDrafts };
  }),
  peekQueuedAgentChatPrompt: (workspaceId, projectId, mode) => {
    const queueKey = getAgentPromptQueueKey(workspaceId, projectId, mode);
    return get().agentChatPromptQueues[queueKey]?.[0] ?? null;
  },
  shiftQueuedAgentChatPrompt: (workspaceId, projectId, mode) => {
    let item: QueuedAgentPrompt | null = null;
    set((state) => {
      const queueKey = getAgentPromptQueueKey(workspaceId, projectId, mode);
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

  activeActionRun: null,
  setActiveActionRun: (run) => set({ activeActionRun: run }),

  activePr: null,
  setActivePr: (pr) => set({ activePr: pr }),
}));
