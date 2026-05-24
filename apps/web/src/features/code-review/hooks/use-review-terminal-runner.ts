"use client";

import { create } from "zustand";

export type ReviewTerminalRunner = (
  command: string,
  label: string,
) => Promise<void> | void;

interface ReviewTerminalRunnerState {
  runner: ReviewTerminalRunner | null;
  setRunner: (runner: ReviewTerminalRunner | null) => void;
}

export const useReviewTerminalRunnerStore = create<ReviewTerminalRunnerState>(
  (set) => ({
    runner: null,
    setRunner: (runner) => set({ runner }),
  }),
);
