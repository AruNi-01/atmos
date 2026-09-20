"use client";

import { create } from "zustand";
import type { ChangesDiffScope } from "@/app-shell/sidebar/ChangesToolbar";

export type NonCommitChangesScope = Exclude<ChangesDiffScope, "commit">;

export type ChangesScopeRequest =
  | {
      scope: NonCommitChangesScope;
      commitHash: null;
      token: number;
    }
  | {
      scope: "commit";
      commitHash: string;
      token: number;
    };

type ChangesScopeBridgeState = {
  request: ChangesScopeRequest | null;
  requestScope: (scope: NonCommitChangesScope) => void;
  requestCommitScope: (commitHash: string) => void;
  consumeRequest: (token: number) => void;
};

/**
 * Landing / empty-state clicks request a Changes panel scope switch.
 * ChangesPanel consumes the request once so local auto-select stays intact.
 */
export const useChangesScopeBridge = create<ChangesScopeBridgeState>((set, get) => ({
  request: null,
  requestScope: (scope) =>
    set({
      request: { scope, commitHash: null, token: Date.now() },
    }),
  requestCommitScope: (commitHash) => {
    const trimmed = commitHash.trim();
    if (!trimmed) return;
    set({
      request: { scope: "commit", commitHash: trimmed, token: Date.now() },
    });
  },
  consumeRequest: (token) => {
    const current = get().request;
    if (!current || current.token !== token) return;
    set({ request: null });
  },
}));
