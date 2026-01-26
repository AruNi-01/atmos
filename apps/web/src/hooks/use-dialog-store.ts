"use client";

import { create } from 'zustand';

interface DialogStore {
  isCreateProjectOpen: boolean;
  setCreateProjectOpen: (open: boolean) => void;
  
  isCreateWorkspaceOpen: boolean;
  setCreateWorkspaceOpen: (open: boolean) => void;
  
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
}

export const useDialogStore = create<DialogStore>((set) => ({
  isCreateProjectOpen: false,
  setCreateProjectOpen: (open) => set({ isCreateProjectOpen: open }),
  
  isCreateWorkspaceOpen: false,
  setCreateWorkspaceOpen: (open) => set({ isCreateWorkspaceOpen: open }),
  
  selectedProjectId: '',
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
}));
