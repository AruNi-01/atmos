'use client';

import { create } from 'zustand';
import { functionSettingsApi, type FunctionSettings } from '@/api/ws/settings-api';
import { settingsBootstrapCache } from '@/api/ws/settings-bootstrap-cache';

interface FunctionSettingsStoreState {
  settings: FunctionSettings | null;
  loaded: boolean;
  load: () => Promise<FunctionSettings>;
  invalidate: () => void;
}

// Singleton promise for deduplication — concurrent callers share the same request
let inflight: Promise<FunctionSettings> | null = null;

export const useFunctionSettingsStore = create<FunctionSettingsStoreState>((set) => ({
  settings: null,
  loaded: false,

  load: async () => {
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
    settingsBootstrapCache.invalidate();
    set({ settings: null, loaded: false });
    inflight = null;
  },
}));
