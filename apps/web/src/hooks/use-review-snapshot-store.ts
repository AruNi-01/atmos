"use client";

import { create } from "zustand";

export interface ReviewSnapshotView {
  snapshotGuid: string;
  label: string;
  filePath: string;
}

interface ReviewSnapshotState {
  current: ReviewSnapshotView | null;
  setSnapshot: (view: ReviewSnapshotView | null) => void;
  clearSnapshot: () => void;
}

export const useReviewSnapshotStore = create<ReviewSnapshotState>((set) => ({
  current: null,
  setSnapshot: (view) => set({ current: view }),
  clearSnapshot: () => set({ current: null }),
}));
