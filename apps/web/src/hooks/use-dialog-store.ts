"use client";

import { create } from 'zustand';

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

  isAgentChatOpen: boolean;
  setAgentChatOpen: (open: boolean) => void;

  isCodeReviewDialogOpen: boolean;
  setCodeReviewDialogOpen: (open: boolean) => void;
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

  isAgentChatOpen: false,
  setAgentChatOpen: (open) => set({ isAgentChatOpen: open }),

  isCodeReviewDialogOpen: false,
  setCodeReviewDialogOpen: (open) => set({ isCodeReviewDialogOpen: open }),
}));
