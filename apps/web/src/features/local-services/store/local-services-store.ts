"use client";

import { create } from "zustand";

import {
  localServicesApi,
  type LocalServicesScanRequest,
  type LocalServicesScanResponse,
} from "@/api/ws/local-services-api";

type ScopeState = {
  data: LocalServicesScanResponse | null;
  loading: boolean;
  error: string | null;
  lastLoadedAt: number;
};

interface LocalServicesStore {
  scopes: Record<string, ScopeState>;
  scan: (request: LocalServicesScanRequest) => Promise<LocalServicesScanResponse | null>;
  clear: (key: string) => void;
}

export function localServicesScopeKey(request: LocalServicesScanRequest): string {
  return [
    request.scope ?? "all_atmos_projects",
    request.project_id ?? "",
    request.workspace_id ?? "",
    request.include_diagnostics ? "diag" : "default",
  ].join(":");
}

const emptyScope = (): ScopeState => ({
  data: null,
  loading: false,
  error: null,
  lastLoadedAt: 0,
});

export const useLocalServicesStore = create<LocalServicesStore>((set, get) => ({
  scopes: {},

  scan: async (request) => {
    const key = localServicesScopeKey(request);
    const current = get().scopes[key] ?? emptyScope();
    set((state) => ({
      scopes: {
        ...state.scopes,
        [key]: {
          ...current,
          loading: true,
          error: null,
        },
      },
    }));

    try {
      const data = await localServicesApi.scan(request);
      set((state) => ({
        scopes: {
          ...state.scopes,
          [key]: {
            data,
            loading: false,
            error: null,
            lastLoadedAt: Date.now(),
          },
        },
      }));
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to scan local services.";
      set((state) => ({
        scopes: {
          ...state.scopes,
          [key]: {
            ...current,
            loading: false,
            error: message,
          },
        },
      }));
      return null;
    }
  },

  clear: (key) => {
    set((state) => {
      const next = { ...state.scopes };
      delete next[key];
      return { scopes: next };
    });
  },
}));
