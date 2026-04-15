"use client";

import { create } from "zustand";

const STORAGE_KEY = "usage-carousel-provider-ids";

interface UsageCarouselStore {
  providerIds: string[];
  hydrated: boolean;
  hydrate: () => void;
  toggleProvider: (providerId: string) => void;
  reconcileProviders: (availableProviderIds: string[]) => void;
}

function readProviderIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeProviderIds(providerIds: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(providerIds));
}

export const useUsageCarouselStore = create<UsageCarouselStore>((set, get) => ({
  providerIds: [],
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ providerIds: readProviderIds(), hydrated: true });
  },

  toggleProvider: (providerId) => {
    const current = get().providerIds;
    const next = current.includes(providerId)
      ? current.filter((id) => id !== providerId)
      : [...current, providerId];
    writeProviderIds(next);
    set({ providerIds: next, hydrated: true });
  },

  reconcileProviders: (availableProviderIds) => {
    const available = new Set(availableProviderIds);
    const next = get().providerIds.filter((id) => available.has(id));
    if (next.length === get().providerIds.length) return;
    writeProviderIds(next);
    set({ providerIds: next });
  },
}));
