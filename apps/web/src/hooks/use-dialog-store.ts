"use client";

import { create } from 'zustand';
import type { AgentChatMode } from '@/types/agent-chat';

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

  /** A prompt queued for the Agent Chat Panel (e.g. from Code Review Dialog). */
  pendingAgentChatPrompt: { prompt: string; registryId?: string; forceNewSession?: boolean } | null;
  setPendingAgentChatPrompt: (data: { prompt: string; registryId?: string; forceNewSession?: boolean } | null) => void;
  /** Peek at the pending prompt without consuming it. */
  peekPendingAgentChatPrompt: () => { prompt: string; registryId?: string; forceNewSession?: boolean } | null;
  /** Consume (read & clear) the pending prompt. */
  consumePendingAgentChatPrompt: () => { prompt: string; registryId?: string; forceNewSession?: boolean } | null;

  isCodeReviewDialogOpen: boolean;
  setCodeReviewDialogOpen: (open: boolean) => void;

  activeActionRun: any | null;
  setActiveActionRun: (run: any | null) => void;
  
  activePr: any | null;
  setActivePr: (pr: any | null) => void;
}

export const useDialogStore = create<DialogStore>((set) => ({
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
    let mode: AgentChatMode | null = null;
    set((state) => {
      mode = state.pendingAgentChatMode;
      return state;
    });
    return mode;
  },
  consumePendingAgentChatMode: () => {
    let mode: AgentChatMode | null = null;
    set((state) => {
      mode = state.pendingAgentChatMode;
      return { pendingAgentChatMode: null };
    });
    return mode;
  },

  pendingAgentChatPrompt: null,
  setPendingAgentChatPrompt: (data) => set({ pendingAgentChatPrompt: data }),
  peekPendingAgentChatPrompt: () => {
    let data = null;
    set((state) => {
      data = state.pendingAgentChatPrompt;
      return state; // No-op, just read
    });
    return data;
  },
  consumePendingAgentChatPrompt: () => {
    let data: { prompt: string; registryId?: string; forceNewSession?: boolean } | null = null;
    set((state) => {
      data = state.pendingAgentChatPrompt;
      return { pendingAgentChatPrompt: null };
    });
    return data;
  },

  isCodeReviewDialogOpen: false,
  setCodeReviewDialogOpen: (open) => set({ isCodeReviewDialogOpen: open }),

  activeActionRun: null,
  setActiveActionRun: (run) => set({ activeActionRun: run }),

  activePr: null,
  setActivePr: (pr) => set({ activePr: pr }),
}));
