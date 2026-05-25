'use client';

import { create } from 'zustand';
import { functionSettingsApi, type FunctionSettings } from '@/api/ws-api';

interface FunctionSettingsStoreState {
  settings: FunctionSettings | null;
  loaded: boolean;
  load: () => Promise<FunctionSettings>;
  invalidate: () => void;
}

// Singleton promise for deduplication — concurrent callers share the same request
let inflight: Promise<FunctionSettings> | null = null;

export const useFunctionSettingsStore = create<FunctionSettingsStoreState>((set, get) => ({
  settings: null,
  loaded: false,

  load: async () => {
    const { settings, loaded } = get();
    if (loaded && settings) return settings;

    if (inflight) return inflight;

    inflight = functionSettingsApi.get().then((result) => {
      set({ settings: result, loaded: true });
      inflight = null;
      return result;
    }).catch((err) => {
      inflight = null;
      throw err;
    });

    return inflight;
  },

  invalidate: () => {
    set({ settings: null, loaded: false });
    inflight = null;
  },
}));
