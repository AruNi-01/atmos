"use client";

import { useCallback } from "react";
import { create } from "zustand";
import { fsApi } from "@/api/ws-api";
import type { CatalogData } from "@/components/wiki/wiki-utils";

interface WikiContextState {
  catalog: CatalogData | null;
  catalogLoading: boolean;
  activePage: string | null;
  activeContent: string | null;
  contentLoading: boolean;
  wikiExists: boolean | null;
}

interface WikiStore {
  contextStates: Record<string, WikiContextState>;
  checkWikiExists: (contextId: string, effectivePath: string) => Promise<boolean>;
  loadCatalog: (contextId: string, effectivePath: string) => Promise<void>;
  loadPage: (contextId: string, effectivePath: string, filePath: string) => Promise<void>;
  setActivePage: (contextId: string, pageId: string) => void;
  resetContext: (contextId: string) => void;
}

const getDefaultState = (): WikiContextState => ({
  catalog: null,
  catalogLoading: false,
  activePage: null,
  activeContent: null,
  contentLoading: false,
  wikiExists: null,
});

function ensureContext(
  state: Record<string, WikiContextState>,
  contextId: string
): WikiContextState {
  return state[contextId] ?? getDefaultState();
}

export const useWikiStore = create<WikiStore>()((set, get) => ({
  contextStates: {},

  checkWikiExists: async (contextId, effectivePath) => {
    const catalogPath = `${effectivePath}/.atmos/wiki/_catalog.json`;
    const response = await fsApi.readFile(catalogPath);
    const exists = response.exists && !!response.content;

    set((state) => ({
      contextStates: {
        ...state.contextStates,
        [contextId]: {
          ...ensureContext(state.contextStates, contextId),
          wikiExists: exists,
        },
      },
    }));

    return exists;
  },

  loadCatalog: async (contextId, effectivePath) => {
    set((state) => ({
      contextStates: {
        ...state.contextStates,
        [contextId]: {
          ...ensureContext(state.contextStates, contextId),
          catalogLoading: true,
        },
      },
    }));

    const catalogPath = `${effectivePath}/.atmos/wiki/_catalog.json`;
    const response = await fsApi.readFile(catalogPath);

    let catalog: CatalogData | null = null;
    if (response.exists && response.content) {
      try {
        catalog = JSON.parse(response.content) as CatalogData;
      } catch {
        catalog = null;
      }
    }

    set((state) => ({
      contextStates: {
        ...state.contextStates,
        [contextId]: {
          ...ensureContext(state.contextStates, contextId),
          catalog,
          catalogLoading: false,
        },
      },
    }));
  },

  loadPage: async (contextId, effectivePath, filePath) => {
    set((state) => ({
      contextStates: {
        ...state.contextStates,
        [contextId]: {
          ...ensureContext(state.contextStates, contextId),
          activePage: filePath.replace(/\.md$/, ""),
          contentLoading: true,
        },
      },
    }));

    const fullPath = `${effectivePath}/.atmos/wiki/${filePath}`;
    const response = await fsApi.readFile(fullPath);

    const content = response.exists && response.content ? response.content : null;

    set((state) => ({
      contextStates: {
        ...state.contextStates,
        [contextId]: {
          ...ensureContext(state.contextStates, contextId),
          activeContent: content,
          contentLoading: false,
        },
      },
    }));
  },

  setActivePage: (contextId, pageId) => {
    set((state) => ({
      contextStates: {
        ...state.contextStates,
        [contextId]: {
          ...ensureContext(state.contextStates, contextId),
          activePage: pageId,
        },
      },
    }));
  },

  resetContext: (contextId) => {
    set((state) => {
      const next = { ...state.contextStates };
      delete next[contextId];
      return { contextStates: next };
    });
  },
}));

export function useWikiContext(contextId: string | null) {
  const store = useWikiStore();

  if (!contextId) {
    return {
      catalog: null,
      catalogLoading: false,
      activePage: null,
      activeContent: null,
      contentLoading: false,
      wikiExists: null,
      checkWikiExists: async () => false,
      loadCatalog: async () => {},
      loadPage: async () => {},
      setActivePage: () => {},
    };
  }

  const state = store.contextStates[contextId] ?? getDefaultState();

  const checkWikiExists = useCallback(
    (effectivePath: string) => store.checkWikiExists(contextId, effectivePath),
    [contextId]
  );
  const loadCatalog = useCallback(
    (effectivePath: string) => store.loadCatalog(contextId, effectivePath),
    [contextId]
  );
  const loadPage = useCallback(
    (effectivePath: string, filePath: string) =>
      store.loadPage(contextId, effectivePath, filePath),
    [contextId]
  );
  const setActivePage = useCallback(
    (pageId: string) => store.setActivePage(contextId, pageId),
    [contextId]
  );

  return {
    ...state,
    checkWikiExists,
    loadCatalog,
    loadPage,
    setActivePage,
  };
}
