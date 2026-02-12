"use client";

import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { fsApi, gitApi } from "@/api/ws-api";
import type { CatalogData, CatalogItem } from "@/components/wiki/wiki-utils";
import { normalizeCatalog } from "@/components/wiki/wiki-utils";

export interface WikiUpdateStatus {
  hasUpdate: boolean;
  checking: boolean;
  catalogCommit: string | null;
  currentCommit: string | null;
  /** True if catalog has no commit_hash (legacy wiki) */
  needsRegeneration?: boolean;
}

interface WikiContextState {
  catalog: CatalogData | null;
  catalogLoading: boolean;
  catalogError: string | null;
  activePage: string | null;
  activeContent: string | null;
  contentLoading: boolean;
  contentError: string | null;
  wikiExists: boolean | null;
  updateStatus: WikiUpdateStatus | null;
}

interface WikiStore {
  contextStates: Record<string, WikiContextState>;
  checkWikiExists: (contextId: string, effectivePath: string) => Promise<boolean>;
  loadCatalog: (contextId: string, effectivePath: string) => Promise<void>;
  checkForUpdates: (contextId: string, effectivePath: string) => Promise<void>;
  loadPage: (contextId: string, effectivePath: string, filePath: string) => Promise<void>;
  setActivePage: (contextId: string, pageId: string) => void;
  resetContext: (contextId: string) => void;
}

const getDefaultState = (): WikiContextState => ({
  catalog: null,
  catalogLoading: false,
  catalogError: null,
  activePage: null,
  activeContent: null,
  contentLoading: false,
  contentError: null,
  wikiExists: null,
  updateStatus: null,
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
    try {
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
    } catch {
      // On network/WS error, treat as "does not exist" so user sees setup flow
      set((state) => ({
        contextStates: {
          ...state.contextStates,
          [contextId]: {
            ...ensureContext(state.contextStates, contextId),
            wikiExists: false,
          },
        },
      }));
      return false;
    }
  },

  loadCatalog: async (contextId, effectivePath) => {
    set((state) => ({
      contextStates: {
        ...state.contextStates,
        [contextId]: {
          ...ensureContext(state.contextStates, contextId),
          catalogLoading: true,
          catalogError: null,
        },
      },
    }));

    try {
      const catalogPath = `${effectivePath}/.atmos/wiki/_catalog.json`;
      const response = await fsApi.readFile(catalogPath);

      let catalog: CatalogData | null = null;
      let catalogError: string | null = null;

      if (response.exists && response.content) {
        try {
          const raw = JSON.parse(response.content) as CatalogData;
          catalog = normalizeCatalog(raw);

          // Prepend Wiki Mindmap above 入门指南 if _mindmap.md exists
          const mindmapPath = `${effectivePath}/.atmos/wiki/_mindmap.md`;
          const mindmapRes = await fsApi.readFile(mindmapPath);
          if (mindmapRes.exists && mindmapRes.content) {
            const mindmapItem: CatalogItem = {
              id: "mindmap",
              title: "Wiki Mindmap",
              path: "_mindmap",
              order: 0,
              file: "_mindmap.md",
              children: [],
            };
            catalog.catalog = [mindmapItem, ...catalog.catalog];
          }
        } catch {
          catalogError = "Invalid _catalog.json format. Please regenerate the wiki.";
        }
      } else {
        catalogError = "Catalog file not found.";
      }

      set((state) => ({
        contextStates: {
          ...state.contextStates,
          [contextId]: {
            ...ensureContext(state.contextStates, contextId),
            catalog,
            catalogLoading: false,
            catalogError,
          },
        },
      }));
    } catch (err) {
      set((state) => ({
        contextStates: {
          ...state.contextStates,
          [contextId]: {
            ...ensureContext(state.contextStates, contextId),
            catalog: null,
            catalogLoading: false,
            catalogError: err instanceof Error ? err.message : "Failed to load catalog.",
          },
        },
      }));
    }
  },

  checkForUpdates: async (contextId, effectivePath) => {
    const { contextStates } = useWikiStore.getState();
    const state = contextStates[contextId];
    const catalog = state?.catalog;
    if (!catalog) return;

    const catalogCommit = catalog.commit_hash;
    if (!catalogCommit) {
      set((s) => ({
        contextStates: {
          ...s.contextStates,
          [contextId]: {
            ...ensureContext(s.contextStates, contextId),
            updateStatus: {
              hasUpdate: false,
              checking: false,
              catalogCommit: null,
              currentCommit: null,
              needsRegeneration: true,
            },
          },
        },
      }));
      return;
    }

    set((s) => ({
      contextStates: {
        ...s.contextStates,
        [contextId]: {
          ...ensureContext(s.contextStates, contextId),
          updateStatus: {
            hasUpdate: false,
            checking: true,
            catalogCommit,
            currentCommit: null,
          },
        },
      },
    }));

    try {
      const { commit_hash: currentCommit } = await gitApi.getHeadCommit(effectivePath);
      const hasUpdate = currentCommit !== catalogCommit;
      set((s) => ({
        contextStates: {
          ...s.contextStates,
          [contextId]: {
            ...ensureContext(s.contextStates, contextId),
            updateStatus: {
              hasUpdate,
              checking: false,
              catalogCommit,
              currentCommit,
            },
          },
        },
      }));
    } catch {
      set((s) => ({
        contextStates: {
          ...s.contextStates,
          [contextId]: {
            ...ensureContext(s.contextStates, contextId),
            updateStatus: {
              hasUpdate: false,
              checking: false,
              catalogCommit,
              currentCommit: null,
            },
          },
        },
      }));
    }
  },

  loadPage: async (contextId, effectivePath, filePath) => {
    set((state) => ({
      contextStates: {
        ...state.contextStates,
        [contextId]: {
          ...ensureContext(state.contextStates, contextId),
          activePage: filePath.replace(/\.md$/, ""),
          contentLoading: true,
          contentError: null,
        },
      },
    }));

    try {
      const fullPath = `${effectivePath}/.atmos/wiki/${filePath}`;
      const response = await fsApi.readFile(fullPath);

      const content = response.exists && response.content ? response.content : null;
      const contentError = !content ? `Page not found: ${filePath}` : null;

      set((state) => ({
        contextStates: {
          ...state.contextStates,
          [contextId]: {
            ...ensureContext(state.contextStates, contextId),
            activeContent: content,
            contentLoading: false,
            contentError,
          },
        },
      }));
    } catch (err) {
      set((state) => ({
        contextStates: {
          ...state.contextStates,
          [contextId]: {
            ...ensureContext(state.contextStates, contextId),
            activeContent: null,
            contentLoading: false,
            contentError: err instanceof Error ? err.message : "Failed to load page.",
          },
        },
      }));
    }
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

/**
 * Hook to access wiki state and actions for a specific context.
 * All hooks are called unconditionally to satisfy React Rules of Hooks.
 * Uses shallow selector to minimize re-renders.
 */
export function useWikiContext(contextId: string | null) {
  // Always subscribe with a selector — only re-render when this context's state changes
  const state = useWikiStore(
    useShallow((s) =>
      contextId ? (s.contextStates[contextId] ?? getDefaultState()) : getDefaultState()
    )
  );

  // Stable action references — always call hooks unconditionally
  const checkWikiExists = useCallback(
    (effectivePath: string) =>
      contextId
        ? useWikiStore.getState().checkWikiExists(contextId, effectivePath)
        : Promise.resolve(false),
    [contextId]
  );

  const loadCatalog = useCallback(
    (effectivePath: string) =>
      contextId
        ? useWikiStore.getState().loadCatalog(contextId, effectivePath)
        : Promise.resolve(),
    [contextId]
  );

  const checkForUpdates = useCallback(
    (effectivePath: string) =>
      contextId
        ? useWikiStore.getState().checkForUpdates(contextId, effectivePath)
        : Promise.resolve(),
    [contextId]
  );

  const loadPage = useCallback(
    (effectivePath: string, filePath: string) =>
      contextId
        ? useWikiStore.getState().loadPage(contextId, effectivePath, filePath)
        : Promise.resolve(),
    [contextId]
  );

  const setActivePage = useCallback(
    (pageId: string) =>
      contextId
        ? useWikiStore.getState().setActivePage(contextId, pageId)
        : undefined,
    [contextId]
  );

  return useMemo(
    () => ({
      ...state,
      checkWikiExists,
      loadCatalog,
      checkForUpdates,
      loadPage,
      setActivePage,
    }),
    [state, checkWikiExists, loadCatalog, checkForUpdates, loadPage, setActivePage]
  );
}
