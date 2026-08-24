"use client";

import { create } from "zustand";
import {
  collectSidebarShortcutTargets,
  sidebarShortcutDigitsFromTargets,
  type HeldShortcutPrefix,
} from "@/app-shell/shortcut-prefix";

type HeldShortcutPrefixState = {
  prefix: HeldShortcutPrefix;
  sidebarDigits: Record<string, number>;
  setPrefix: (prefix: HeldShortcutPrefix) => void;
};

function digitsForPrefix(prefix: HeldShortcutPrefix): Record<string, number> {
  if (prefix !== "mod-shift" || typeof document === "undefined") return {};
  return sidebarShortcutDigitsFromTargets(collectSidebarShortcutTargets(document));
}

export const useHeldShortcutPrefixStore = create<HeldShortcutPrefixState>((set, get) => ({
  prefix: null,
  sidebarDigits: {},
  setPrefix: (prefix) => {
    const current = get();
    const sidebarDigits = digitsForPrefix(prefix);
    if (
      current.prefix === prefix &&
      sameDigitMap(current.sidebarDigits, sidebarDigits)
    ) {
      return;
    }
    set({ prefix, sidebarDigits });
  },
}));

function sameDigitMap(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

export function useHeldShortcutPrefix(): HeldShortcutPrefix {
  return useHeldShortcutPrefixStore((state) => state.prefix);
}

export function useSidebarShortcutDigit(targetKey: string): number | null {
  return useHeldShortcutPrefixStore((state) =>
    state.prefix === "mod-shift" ? (state.sidebarDigits[targetKey] ?? null) : null,
  );
}
