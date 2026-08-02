"use client";

import { create } from "zustand";

export type PrConflictPreviewPayload = {
  owner: string;
  repo: string;
  prNumber: number;
  files: string[];
  contents: Record<string, string>;
  baseOid?: string;
  headOid?: string;
  updatedAt: number;
};

type PrConflictPreviewStore = {
  preview: PrConflictPreviewPayload | null;
  setPreview: (preview: PrConflictPreviewPayload | null) => void;
};

/**
 * Ephemeral cache for PR conflict paths + conflict-marked contents
 * produced by github_pr_conflict_files (merge-tree / merge-file).
 * Used by the read-only conflict center tab so we do not depend on a
 * local unmerged worktree.
 */
export const usePrConflictPreviewStore = create<PrConflictPreviewStore>(
  (set) => ({
    preview: null,
    setPreview: (preview) => set({ preview }),
  }),
);

export function matchPrConflictPreview(
  preview: PrConflictPreviewPayload | null,
  params: { owner: string; repo: string; prNumber: number },
): PrConflictPreviewPayload | null {
  if (!preview) return null;
  if (
    preview.owner !== params.owner ||
    preview.repo !== params.repo ||
    preview.prNumber !== params.prNumber
  ) {
    return null;
  }
  return preview;
}
