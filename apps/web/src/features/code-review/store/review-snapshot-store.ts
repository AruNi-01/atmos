"use client";

import { create } from "zustand";

export interface ReviewSnapshotView {
  snapshotGuid: string;
  label: string;
  filePath: string;
}

export interface ReviewSessionDisplay {
  sessionTitle: string | null;
  revisionLabel: string | null;
}

interface ReviewSnapshotState {
  current: ReviewSnapshotView | null;
  sessionDisplay: ReviewSessionDisplay | null;
  setSnapshot: (view: ReviewSnapshotView | null) => void;
  setSessionDisplay: (display: ReviewSessionDisplay | null) => void;
  clearSnapshot: () => void;
}

export const useReviewSnapshotStore = create<ReviewSnapshotState>((set) => ({
  current: null,
  sessionDisplay: null,
  setSnapshot: (view) => set({ current: view }),
  setSessionDisplay: (display) => set({ sessionDisplay: display }),
  clearSnapshot: () => set({ current: null, sessionDisplay: null }),
}));
