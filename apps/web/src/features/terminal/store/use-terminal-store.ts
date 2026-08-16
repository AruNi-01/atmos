"use client";

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { TerminalLayoutNode } from "@/features/terminal/types/index";
import { getLeaves } from "@/features/terminal/lib/terminal-layout-tree";
import { workspaceLayoutApi, projectLayoutApi, systemApi } from "@/api/rest-api";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import { createTerminalAuxiliaryActions } from "@/features/terminal/store/terminal-store-auxiliary-actions";
import {
  FIXED_TERMINAL_TAB_VALUE,
  migrateTerminalLayoutDocument,
} from "@/features/terminal/lib/terminal-layout-document";
import {
  TERMINAL_TAB_VALUE_PREFIX,
  buildPersistedTerminalWorkspaceLayout,
  createLayoutFromTmuxWindows,
  createFixedTerminalTab,
  createInitialLayout,
  createTerminalPane,
  detachTerminalWorkspaceFrontendState,
  evictTerminalWorkspaceRuntimeState,
  getAllDefaultPanesForWorkspace,
  getNextWindowName,
  getNextTerminalTabTitle,
  getUniqueTerminalTabTitle,
  getScopeKey,
  getTerminalWorkspaceScopeKey,
  getUniqueAgentName,
  getWorkspaceTerminalTabs,
  hydratePersistedTab,
  isTerminalWorkspaceScopeKeyForWorkspace,
  normalizeCustomName,
  nextOscTitleFromIncoming,
  removePaneFromLayout,
  samePaneAgent,
  splitPaneInLayout,
  type TerminalCenterTab,
} from "@/features/terminal/store/terminal-store-helpers";
import type { TerminalStore } from "@/features/terminal/store/terminal-store-types";

export { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";
export {
  CODE_REVIEW_WINDOW_NAME,
  PROJECT_WIKI_WINDOW_NAME,
  TERMINAL_TAB_VALUE_PREFIX,
  findWorkspacePaneIdsByTmuxWindowName,
  getTerminalWorkspaceScopeKey,
  getWorkspacePaneFieldsByPaneId,
  getWorkspacePaneLiveFieldsByTmuxWindow,
  type TerminalCenterTab,
} from "@/features/terminal/store/terminal-store-helpers";

const SAVE_DEBOUNCE_MS = 500;

export const useTerminalStore = create<TerminalStore>()((set, get) => {
  const clearWorkspaceSaveTimeouts = (workspaceId: string) => {
    for (const [key, timeout] of Object.entries(get().saveTimeouts)) {
      if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
        clearTimeout(timeout);
      }
    }
  };

  const ensureWorkspaceContext = (workspaceId: string, isProjectContext: boolean) => {
    const currentContext = get().workspaceContexts[workspaceId];

    if (currentContext === isProjectContext) {
      return;
    }

    if (currentContext === undefined) {
      set((state) => ({
        workspaceContexts: { ...state.workspaceContexts, [workspaceId]: isProjectContext },
      }));
      return;
    }

    clearWorkspaceSaveTimeouts(workspaceId);
    set((state) => {
      const evicted = evictTerminalWorkspaceRuntimeState(state, workspaceId);
      return {
        ...evicted,
        workspaceContexts: {
          ...evicted.workspaceContexts,
          [workspaceId]: isProjectContext,
        },
      };
    });
  };

  return ({
  workspaceTerminalTabs: {},
  workspaceActiveTerminalTabIds: {},
  workspaceActivePaneIds: {},
  workspacePanes: {},
  workspaceLayouts: {},
  workspaceMaximizedIds: {},
  loadedWorkspaces: new Set(),
  hydratedTerminalScopes: new Set(),
  initializingWorkspaces: new Set(),
  initializingTerminalScopes: new Set(),
  saveTimeouts: {},
  isHydrated: false,
  tmuxWindowsCache: {},
  persistedTerminalLayouts: {},
  // Track whether each workspaceId is actually a project context
  // (when on /project?id=xxx, workspaceId holds the project ID)
  workspaceContexts: {},
  projectWikiPanes: {},
  projectWikiLayouts: {},
  projectWikiMaximizedIds: {},
  projectWikiLoadedWorkspaces: new Set(),
  projectWikiInitializingWorkspaces: new Set(),
  codeReviewPanes: {},
  codeReviewLayouts: {},
  codeReviewMaximizedIds: {},
  codeReviewLoadedWorkspaces: new Set(),
  codeReviewInitializingWorkspaces: new Set(),

  getTerminalTabs: (workspaceId) => {
    const state = get();
    return getWorkspaceTerminalTabs(state, workspaceId);
  },

  getActiveTerminalTabId: (workspaceId) => {
    const state = get();
    const activeTabId = state.workspaceActiveTerminalTabIds[workspaceId];
    const tabs = getWorkspaceTerminalTabs(state, workspaceId);
    if (activeTabId && tabs.some((tab) => tab.id === activeTabId)) {
      return activeTabId;
    }
    return tabs[0]?.id ?? FIXED_TERMINAL_TAB_VALUE;
  },

  setActiveTerminalTab: (workspaceId, terminalTabId) => {
    set((state) => ({
      workspaceActiveTerminalTabIds: {
        ...state.workspaceActiveTerminalTabIds,
        [workspaceId]: terminalTabId,
      },
    }));
    get().saveToBackend(workspaceId);
  },

  createTerminalTab: (workspaceId, options) => {
    const state = get();
    const existingTabs = getWorkspaceTerminalTabs(state, workspaceId);
    const newTab: TerminalCenterTab = existingTabs.length === 0
      ? createFixedTerminalTab()
      : {
          id: `${TERMINAL_TAB_VALUE_PREFIX}${uuidv4()}`,
          title: options?.title
            ? getUniqueTerminalTabTitle(existingTabs, options.title)
            : getNextTerminalTabTitle(existingTabs),
          closable: true,
        };
    const allPanes = getAllDefaultPanesForWorkspace(state, workspaceId);
    const { panes, layout } = createInitialLayout(workspaceId, allPanes);
    const scopeKey = getScopeKey(workspaceId, newTab.id);

    set((currentState) => ({
      workspaceTerminalTabs: {
        ...currentState.workspaceTerminalTabs,
        [workspaceId]: [...getWorkspaceTerminalTabs(currentState, workspaceId), newTab],
      },
      workspaceActiveTerminalTabIds: {
        ...currentState.workspaceActiveTerminalTabIds,
        [workspaceId]: newTab.id,
      },
      workspacePanes: {
        ...currentState.workspacePanes,
        [scopeKey]: panes,
      },
      workspaceLayouts: {
        ...currentState.workspaceLayouts,
        [scopeKey]: layout,
      },
      workspaceMaximizedIds: {
        ...currentState.workspaceMaximizedIds,
        [scopeKey]: null,
      },
      hydratedTerminalScopes: new Set([...currentState.hydratedTerminalScopes, scopeKey]),
    }));

    get().saveToBackend(workspaceId);
    return newTab;
  },

  createTerminalTabWithInitialPane: async (workspaceId, contextScope = "workspace", options) => {
    const isProjectContext = contextScope === "project";
    const workspaceScopeKey = getTerminalWorkspaceScopeKey(workspaceId, isProjectContext);

    ensureWorkspaceContext(workspaceId, isProjectContext);

    if (!get().loadedWorkspaces.has(workspaceScopeKey)) {
      await get().loadFromBackend(workspaceId, isProjectContext, null);
    }

    if (
      (get().workspaceContexts[workspaceId] ?? false) !== isProjectContext ||
      !get().loadedWorkspaces.has(workspaceScopeKey)
    ) {
      return null;
    }

    const tab = get().createTerminalTab(workspaceId, { title: options?.title });
    const panes = get().getPanes(workspaceId, tab.id);
    const [paneId, pane] = Object.entries(panes)[0] ?? [];
    if (!paneId || !pane) {
      return null;
    }

    if (options?.paneLabel || options?.paneAgent) {
      const scopeKey = getScopeKey(workspaceId, tab.id);
      const allPanes = getAllDefaultPanesForWorkspace(get(), workspaceId);
      const nextLabel = options.paneLabel
        ? getUniqueAgentName(options.paneLabel, allPanes)
        : pane.label;
      const nextPane: TerminalPaneProps = {
        ...pane,
        label: nextLabel,
        tmuxWindowName: pane.isNewPane ? nextLabel : pane.tmuxWindowName,
        agent: options.paneAgent ?? pane.agent,
      };

      set((state) => ({
        workspacePanes: {
          ...state.workspacePanes,
          [scopeKey]: {
            ...state.workspacePanes[scopeKey],
            [paneId]: nextPane,
          },
        },
      }));
      get().saveToBackend(workspaceId);

      return { tab, paneId, pane: nextPane };
    }

    return { tab, paneId, pane };
  },

  closeTerminalTab: (workspaceId, terminalTabId) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    set((state) => {
      const nextTabs = getWorkspaceTerminalTabs(state, workspaceId).filter((tab) => tab.id !== terminalTabId);
      const restPanes = { ...state.workspacePanes };
      const restLayouts = { ...state.workspaceLayouts };
      const restMaximized = { ...state.workspaceMaximizedIds };
      const restActivePanes = { ...state.workspaceActivePaneIds };
      const nextHydratedScopes = new Set(state.hydratedTerminalScopes);
      const nextInitializingScopes = new Set(state.initializingTerminalScopes);
      delete restPanes[scopeKey];
      delete restLayouts[scopeKey];
      delete restMaximized[scopeKey];
      delete restActivePanes[scopeKey];
      nextHydratedScopes.delete(scopeKey);
      nextInitializingScopes.delete(scopeKey);

      return {
        workspaceTerminalTabs: {
          ...state.workspaceTerminalTabs,
          [workspaceId]: nextTabs,
        },
        workspaceActiveTerminalTabIds: {
          ...state.workspaceActiveTerminalTabIds,
          [workspaceId]: (() => {
            const activeTabId = state.workspaceActiveTerminalTabIds[workspaceId];
            if (activeTabId && activeTabId !== terminalTabId && nextTabs.some((tab) => tab.id === activeTabId)) {
              return activeTabId;
            }
            return nextTabs[0]?.id ?? "";
          })(),
        },
        workspacePanes: restPanes,
        workspaceLayouts: restLayouts,
        workspaceMaximizedIds: restMaximized,
        workspaceActivePaneIds: restActivePanes,
        hydratedTerminalScopes: nextHydratedScopes,
        initializingTerminalScopes: nextInitializingScopes,
      };
    });

    get().saveToBackend(workspaceId);
  },

  getPanes: (workspaceId, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const state = get();
    return state.workspacePanes[getScopeKey(workspaceId, terminalTabId)] || {};
  },

  /** Find pane ID by tmux window name. Returns null if not found. */
  getPaneIdByTmuxWindowName: (workspaceId, tmuxWindowName, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const panes = get().workspacePanes[getScopeKey(workspaceId, terminalTabId)] || {};
    const entry = Object.entries(panes).find(([, p]) => p.tmuxWindowName === tmuxWindowName);
    return entry ? entry[0] : null;
  },

  getLayout: (workspaceId, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const state = get();
    return state.workspaceLayouts[getScopeKey(workspaceId, terminalTabId)] || null;
  },

  getMaximizedTerminalId: (workspaceId, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const state = get();
    return state.workspaceMaximizedIds[getScopeKey(workspaceId, terminalTabId)] || null;
  },

  isWorkspaceReady: (workspaceId, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const state = get();
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const workspaceScopeKey = getTerminalWorkspaceScopeKey(
      workspaceId,
      state.workspaceContexts[workspaceId] ?? false,
    );
    return (
      state.loadedWorkspaces.has(workspaceScopeKey) &&
      state.hydratedTerminalScopes.has(scopeKey) &&
      !state.initializingWorkspaces.has(workspaceScopeKey) &&
      !state.initializingTerminalScopes.has(scopeKey)
    );
  },

  setLayout: (workspaceId, layout, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    set((state) => ({
      workspaceLayouts: {
        ...state.workspaceLayouts,
        [scopeKey]: layout,
      },
    }));
    
    // Clean up panes that are no longer in the layout
    const currentPanes = get().workspacePanes[scopeKey] || {};
    const leaves = layout ? getLeaves(layout) : [];
    const leafSet = new Set(leaves);
    
    const nextPanes: Record<string, TerminalPaneProps> = {};
    let changed = false;
    
    Object.keys(currentPanes).forEach(id => {
      if (leafSet.has(id)) {
        nextPanes[id] = currentPanes[id];
      } else {
        changed = true;
      }
    });

    if (changed) {
      set((state) => ({
        workspacePanes: {
          ...state.workspacePanes,
          [scopeKey]: nextPanes,
        },
      }));
    }

    // Debounced save to backend
    get().saveToBackend(workspaceId);
  },

  primeWorkspace: (workspaceId, isProjectContext = false) => {
    ensureWorkspaceContext(workspaceId, isProjectContext);

    const state = get();
    const workspaceScopeKey = getTerminalWorkspaceScopeKey(workspaceId, isProjectContext);

    if (state.loadedWorkspaces.has(workspaceScopeKey)) {
      return;
    }

    if (state.initializingWorkspaces.has(workspaceScopeKey)) {
      return;
    }

    set((state) => ({
      initializingWorkspaces: new Set([...state.initializingWorkspaces, workspaceScopeKey]),
    }));

    void get().loadFromBackend(workspaceId, isProjectContext, null);
  },

  initWorkspace: (workspaceId, isProjectContext = false, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    ensureWorkspaceContext(workspaceId, isProjectContext);

    const state = get();
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const workspaceScopeKey = getTerminalWorkspaceScopeKey(workspaceId, isProjectContext);

    if (state.hydratedTerminalScopes.has(scopeKey) || state.initializingTerminalScopes.has(scopeKey)) {
      return;
    }

    if (!state.loadedWorkspaces.has(workspaceScopeKey) && !state.initializingWorkspaces.has(workspaceScopeKey)) {
      set((currentState) => ({
        initializingWorkspaces: new Set([...currentState.initializingWorkspaces, workspaceScopeKey]),
        initializingTerminalScopes: new Set([...currentState.initializingTerminalScopes, scopeKey]),
      }));
      void get().loadFromBackend(workspaceId, isProjectContext, terminalTabId);
      return;
    }

    set((currentState) => ({
      initializingTerminalScopes: new Set([...currentState.initializingTerminalScopes, scopeKey]),
    }));
    void get().loadFromBackend(workspaceId, isProjectContext, terminalTabId);
  },

  evictWorkspaceRuntime: (workspaceId) => {
    clearWorkspaceSaveTimeouts(workspaceId);

    set((currentState) => evictTerminalWorkspaceRuntimeState(currentState, workspaceId));
  },

  detachWorkspaceFrontend: (workspaceId) => {
    clearWorkspaceSaveTimeouts(workspaceId);

    set((currentState) => ({
      ...detachTerminalWorkspaceFrontendState(currentState, workspaceId),
    }));
  },

  addTerminal: (workspaceId, label, terminalTabId = FIXED_TERMINAL_TAB_VALUE, agent) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const panes = get().workspacePanes[scopeKey] || {};
    const layout = get().workspaceLayouts[scopeKey];
    const allPanes = getAllDefaultPanesForWorkspace(get(), workspaceId);
    const newId = uuidv4();
    // For agent names (non-numeric), use unique suffix logic; otherwise use numeric names
    const windowName = label
      ? getUniqueAgentName(label, allPanes)
      : getNextWindowName(allPanes);

    const newPane = createTerminalPane(workspaceId, windowName, {
      id: newId,
      tmuxWindowName: windowName,
      isNewPane: true,
      agent,
    });

    const nextPanes = { ...panes, [newId]: newPane };

    let nextLayout: TerminalLayoutNode<string>;
    if (!layout) {
      nextLayout = newId;
    } else {
      // Add to the end (top-level split)
      nextLayout = {
        direction: 'row',
        first: layout,
        second: newId,
      };
    }

    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [scopeKey]: nextPanes,
      },
      workspaceLayouts: {
        ...state.workspaceLayouts,
        [scopeKey]: nextLayout,
      },
    }));

    get().saveToBackend(workspaceId);
    return newId;
  },

  removeTerminal: (workspaceId, id, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const layout = get().workspaceLayouts[scopeKey];
    if (!layout) return;

    const updatedLayout = removePaneFromLayout(layout, id);
    
    if (!updatedLayout) {
      // If no terminals left, create a fresh one
      const allPanes = getAllDefaultPanesForWorkspace(get(), workspaceId);
      const currentPanes = get().workspacePanes[scopeKey] || {};
      const remainingPanes = Object.fromEntries(
        Object.entries(allPanes).filter(([paneId]) => !currentPanes[paneId])
      );
      const { panes, layout: initialLayout } = createInitialLayout(workspaceId, remainingPanes);
      set((state) => ({
        workspacePanes: {
          ...state.workspacePanes,
          [scopeKey]: panes,
        },
        workspaceLayouts: {
          ...state.workspaceLayouts,
          [scopeKey]: initialLayout,
        },
      }));
      get().saveToBackend(workspaceId);
    } else {
      get().setLayout(workspaceId, updatedLayout, terminalTabId);
    }
  },

  splitTerminal: (workspaceId, id, direction, terminalTabId = FIXED_TERMINAL_TAB_VALUE, agent) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const layout = get().workspaceLayouts[scopeKey];
    const panes = get().workspacePanes[scopeKey] || {};
    const allPanes = getAllDefaultPanesForWorkspace(get(), workspaceId);
    if (!layout) return null;

    const newId = uuidv4();
    const windowName = agent
      ? getUniqueAgentName(agent.label, allPanes)
      : getNextWindowName(allPanes);
    
    const newPane = createTerminalPane(workspaceId, windowName, {
      id: newId,
      tmuxWindowName: windowName,
      isNewPane: true,
      agent,
    });

    const nextPanes = { ...panes, [newId]: newPane };

    const nextLayout = splitPaneInLayout(layout, id, newId, direction);
    
    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [scopeKey]: nextPanes,
      },
      workspaceLayouts: {
        ...state.workspaceLayouts,
        [scopeKey]: nextLayout,
      },
    }));

    get().saveToBackend(workspaceId);
    return newId;
  },

  setActivePaneId: (workspaceId, paneId, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const current = get().workspaceActivePaneIds[scopeKey] ?? null;
    if (current === paneId) return;
    set((state) => ({
      workspaceActivePaneIds: {
        ...state.workspaceActivePaneIds,
        [scopeKey]: paneId,
      },
    }));
  },

  toggleMaximize: (workspaceId: string, id: string, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    set((state) => {
      const currentMaximizedId = state.workspaceMaximizedIds[scopeKey];
      const newMaximizedId = currentMaximizedId === id ? null : id;

      return {
        workspaceMaximizedIds: {
          ...state.workspaceMaximizedIds,
          [scopeKey]: newMaximizedId,
        },
      };
    });

    get().saveToBackend(workspaceId);
  },

  fetchTmuxWindows: async (workspaceId, isProjectContext) => {
    try {
      const response = await systemApi.listTmuxWindows(workspaceId);
      const windows = response.windows || [];
      const resolvedIsProjectContext = isProjectContext ?? get().workspaceContexts[workspaceId] ?? false;
      const workspaceScopeKey = getTerminalWorkspaceScopeKey(
        workspaceId,
        resolvedIsProjectContext,
      );

      if ((get().workspaceContexts[workspaceId] ?? false) !== resolvedIsProjectContext) {
        return windows;
      }
      
      // Cache the windows
      set((state) => ({
        tmuxWindowsCache: {
          ...state.tmuxWindowsCache,
          [workspaceScopeKey]: windows,
        },
      }));
      
      return windows;
    } catch (error) {
      console.debug('Failed to fetch tmux windows:', error);
      return [];
    }
  },

  loadFromBackend: async (workspaceId, isProjectContext = false, terminalTabId = null) => {
    if (typeof window === "undefined") return;

    ensureWorkspaceContext(workspaceId, isProjectContext);

    const workspaceScopeKey = getTerminalWorkspaceScopeKey(workspaceId, isProjectContext);
    const targetTabId = terminalTabId ?? null;
    const targetScopeKey = targetTabId ? getScopeKey(workspaceId, targetTabId) : null;
    const layoutApi = isProjectContext ? projectLayoutApi : workspaceLayoutApi;
    const isCurrentContext = () => (get().workspaceContexts[workspaceId] ?? false) === isProjectContext;

    const clearWorkspaceInitializing = () => {
      set((state) => ({
        initializingWorkspaces: new Set(
          [...state.initializingWorkspaces].filter((id) => id !== workspaceScopeKey),
        ),
      }));
    };

    const clearScopeInitializing = () => {
      if (!targetScopeKey) return;
      set((state) => ({
        initializingTerminalScopes: new Set(
          [...state.initializingTerminalScopes].filter((id) => id !== targetScopeKey),
        ),
      }));
    };

    try {
      let state = get();

      let persistedLayout = state.persistedTerminalLayouts[workspaceScopeKey] ?? null;
      let existingWindows = state.tmuxWindowsCache[workspaceScopeKey] ?? [];
      let loadedMetadataThisCall = false;

      if (!state.loadedWorkspaces.has(workspaceScopeKey)) {
        const [layoutResult, fetchedWindows] = await Promise.all([
          layoutApi.getLayout(workspaceId).catch(() => null),
          get().fetchTmuxWindows(workspaceId, isProjectContext),
        ]);

        existingWindows = fetchedWindows;
        if (!isCurrentContext()) {
          clearScopeInitializing();
          clearWorkspaceInitializing();
          return;
        }

        if (layoutResult?.layout) {
          const parsed = JSON.parse(layoutResult.layout) as unknown;
          const migrated = migrateTerminalLayoutDocument(parsed);
          if (migrated) {
            persistedLayout = migrated.layout;
            const availableTabs = migrated.layout.tabs.map((tab) => ({
              id: tab.id,
              title: tab.id === FIXED_TERMINAL_TAB_VALUE ? "Term" : tab.title,
              closable: true,
              customTitle: tab.customTitle,
            }));
            const activeTabId =
              migrated.layout.activeTabId && availableTabs.some((tab) => tab.id === migrated.layout.activeTabId)
                ? migrated.layout.activeTabId
                : availableTabs[0]?.id ?? "";

            set((currentState) => ({
              workspaceTerminalTabs: {
                ...currentState.workspaceTerminalTabs,
                [workspaceId]: availableTabs,
              },
              workspaceActiveTerminalTabIds: {
                ...currentState.workspaceActiveTerminalTabIds,
                [workspaceId]: activeTabId,
              },
              persistedTerminalLayouts: {
                ...currentState.persistedTerminalLayouts,
                [workspaceScopeKey]: migrated.layout,
              },
              loadedWorkspaces: new Set([...currentState.loadedWorkspaces, workspaceScopeKey]),
              initializingWorkspaces: new Set(
                [...currentState.initializingWorkspaces].filter((id) => id !== workspaceScopeKey),
              ),
              isHydrated: true,
            }));
            loadedMetadataThisCall = true;

            if (migrated.migrated) {
              void layoutApi.updateLayout(workspaceId, JSON.stringify(migrated.layout)).catch((error) => {
                console.debug("Failed to rewrite terminal layout to canonical schema:", error);
              });
            }
          } else {
            console.debug("Persisted terminal layout contained no valid tab states, falling back");
          }
        }

        if (!persistedLayout) {
          set((currentState) => ({
            workspaceTerminalTabs: {
              ...currentState.workspaceTerminalTabs,
              [workspaceId]: [createFixedTerminalTab()],
            },
            workspaceActiveTerminalTabIds: {
              ...currentState.workspaceActiveTerminalTabIds,
              [workspaceId]: FIXED_TERMINAL_TAB_VALUE,
            },
            persistedTerminalLayouts: {
              ...currentState.persistedTerminalLayouts,
              [workspaceScopeKey]: null,
            },
            loadedWorkspaces: new Set([...currentState.loadedWorkspaces, workspaceScopeKey]),
            initializingWorkspaces: new Set(
              [...currentState.initializingWorkspaces].filter((id) => id !== workspaceScopeKey),
            ),
            isHydrated: true,
          }));
          loadedMetadataThisCall = true;
        }
      } else if (existingWindows.length === 0) {
        existingWindows = await get().fetchTmuxWindows(workspaceId, isProjectContext);
        if (!isCurrentContext()) {
          clearScopeInitializing();
          clearWorkspaceInitializing();
          return;
        }
      }

      state = get();
      persistedLayout = state.persistedTerminalLayouts[workspaceScopeKey] ?? persistedLayout;

      if (loadedMetadataThisCall && persistedLayout?.tabs.length) {
        setTimeout(() => {
          const currentState = get();
          if ((currentState.workspaceContexts[workspaceId] ?? false) !== isProjectContext) {
            return;
          }
          for (const tab of persistedLayout?.tabs ?? []) {
            const scopeKey = getScopeKey(workspaceId, tab.id);
            if (
              currentState.hydratedTerminalScopes.has(scopeKey) ||
              currentState.initializingTerminalScopes.has(scopeKey)
            ) {
              continue;
            }

            set((nextState) => ({
              initializingTerminalScopes: new Set([
                ...nextState.initializingTerminalScopes,
                scopeKey,
              ]),
            }));
            void get().loadFromBackend(workspaceId, isProjectContext, tab.id);
          }
        }, 0);
      }

      if (!targetTabId) {
        clearWorkspaceInitializing();
        return;
      }

      if (state.hydratedTerminalScopes.has(targetScopeKey!)) {
        clearScopeInitializing();
        return;
      }

      const existingWindowNames = new Set(existingWindows.map((window) => window.name));

      if (persistedLayout) {
        const persistedTab = persistedLayout.tabs.find((tab) => tab.id === targetTabId);
        const livePanesForScope = get().workspacePanes[targetScopeKey!] ?? null;
        const hydratedTab = persistedTab
          ? hydratePersistedTab(
              workspaceId,
              persistedTab,
              existingWindowNames,
              livePanesForScope,
            )
          : null;

        if (hydratedTab) {
          set((currentState) => ({
            workspacePanes: {
              ...currentState.workspacePanes,
              [targetScopeKey!]: hydratedTab.panes,
            },
            workspaceLayouts: {
              ...currentState.workspaceLayouts,
              [targetScopeKey!]: hydratedTab.layout,
            },
            workspaceMaximizedIds: {
              ...currentState.workspaceMaximizedIds,
              [targetScopeKey!]: hydratedTab.maximizedTerminalId,
            },
            hydratedTerminalScopes: new Set([
              ...currentState.hydratedTerminalScopes,
              targetScopeKey!,
            ]),
            initializingTerminalScopes: new Set(
              [...currentState.initializingTerminalScopes].filter((id) => id !== targetScopeKey),
            ),
          }));
          return;
        }
      }

      if (targetTabId === FIXED_TERMINAL_TAB_VALUE && existingWindows.length > 0) {
        const tmuxLayout = createLayoutFromTmuxWindows(workspaceId, existingWindows);
        if (!tmuxLayout) return;

        set((currentState) => ({
          workspacePanes: {
            ...currentState.workspacePanes,
            [targetScopeKey!]: tmuxLayout.panes,
          },
          workspaceLayouts: {
            ...currentState.workspaceLayouts,
            [targetScopeKey!]: tmuxLayout.layout,
          },
          workspaceMaximizedIds: {
            ...currentState.workspaceMaximizedIds,
            [targetScopeKey!]: null,
          },
          hydratedTerminalScopes: new Set([
            ...currentState.hydratedTerminalScopes,
            targetScopeKey!,
          ]),
          initializingTerminalScopes: new Set(
            [...currentState.initializingTerminalScopes].filter((id) => id !== targetScopeKey),
          ),
        }));
        return;
      }

      const allPanes = getAllDefaultPanesForWorkspace(get(), workspaceId);
      const { panes: initialPanes, layout: initialLayout } = createInitialLayout(workspaceId, allPanes);

      set((currentState) => ({
        workspacePanes: {
          ...currentState.workspacePanes,
          [targetScopeKey!]: initialPanes,
        },
        workspaceLayouts: {
          ...currentState.workspaceLayouts,
          [targetScopeKey!]: initialLayout,
        },
        workspaceMaximizedIds: {
          ...currentState.workspaceMaximizedIds,
          [targetScopeKey!]: null,
        },
        hydratedTerminalScopes: new Set([
          ...currentState.hydratedTerminalScopes,
          targetScopeKey!,
        ]),
        initializingTerminalScopes: new Set(
          [...currentState.initializingTerminalScopes].filter((id) => id !== targetScopeKey),
        ),
      }));
    } catch (error) {
      console.debug("Failed to load terminal layout from backend:", error);
      clearScopeInitializing();
      clearWorkspaceInitializing();
    }
  },

  saveToBackend: (workspaceId, isProjectContextOverride) => {
    if (typeof window === 'undefined') return;

    const state = get();
    const isProjectContext = isProjectContextOverride ?? state.workspaceContexts[workspaceId] ?? false;
    const workspaceScopeKey = getTerminalWorkspaceScopeKey(workspaceId, isProjectContext);

    if (
      !state.loadedWorkspaces.has(workspaceScopeKey) ||
      state.initializingWorkspaces.has(workspaceScopeKey)
    ) {
      return;
    }
    if (state.saveTimeouts[workspaceScopeKey]) {
      clearTimeout(state.saveTimeouts[workspaceScopeKey]);
    }

    const timeout = setTimeout(async () => {
      const currentState = get();
      if ((currentState.workspaceContexts[workspaceId] ?? false) !== isProjectContext) {
        return;
      }

      try {
        // Never overwrite a persisted workspace/project layout with an empty shell.
        // This can happen during early mount when tab UI state is ready before the
        // actual pane/layout state has hydrated from backend.
        const payload = buildPersistedTerminalWorkspaceLayout(currentState, workspaceId);
        if (!payload) {
          console.debug('Skipping terminal layout save because no valid tab states are available yet');
          return;
        }

        const layoutApi = isProjectContext ? projectLayoutApi : workspaceLayoutApi;
        set((state) => ({
          persistedTerminalLayouts: {
            ...state.persistedTerminalLayouts,
            [workspaceScopeKey]: payload,
          },
        }));

        await layoutApi.updateLayout(workspaceId, JSON.stringify(payload));
      } catch (error) {
        console.debug('Failed to save terminal layout to backend:', error);
      }
    }, SAVE_DEBOUNCE_MS);
    
    set((state) => ({
      saveTimeouts: {
        ...state.saveTimeouts,
        [workspaceScopeKey]: timeout,
      },
    }));
  },

  setTmuxWindowName: (workspaceId, paneId, tmuxWindowName, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const panes = get().workspacePanes[scopeKey];
    if (!panes || !panes[paneId]) return;

    const updatedPanes = {
      ...panes,
      [paneId]: {
        ...panes[paneId],
        // Keep tmux identifiers in sync with the actual window name.
        // Do NOT touch `label` — it is the immutable user-visible display name.
        tmuxWindowName,
      },
    };

    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [scopeKey]: updatedPanes,
      },
    }));

    get().saveToBackend(workspaceId);
  },

  markPaneAttached: (workspaceId, paneId, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const panes = get().workspacePanes[scopeKey];
    const pane = panes?.[paneId];
    if (!pane || !pane.isNewPane) return;

    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [scopeKey]: {
          ...state.workspacePanes[scopeKey],
          [paneId]: {
            ...pane,
            isNewPane: false,
          },
        },
      },
    }));

    get().saveToBackend(workspaceId);
  },

  setDynamicTitle: (workspaceId, paneId, dynamicTitle, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const panes = get().workspacePanes[scopeKey];
    if (!panes || !panes[paneId]) return;

    // Only update if the title actually changed (avoid unnecessary re-renders)
    if (panes[paneId].dynamicTitle === dynamicTitle) return;

    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [scopeKey]: {
          ...panes,
          [paneId]: {
            ...panes[paneId],
            dynamicTitle,
          },
        },
      },
    }));
    // NOTE: Do NOT call saveToBackend — dynamicTitle is transient display-only
  },

  setOscTitle: (workspaceId, paneId, oscTitle, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const panes = get().workspacePanes[scopeKey];
    if (!panes || !panes[paneId]) return;

    // Shell path/host/`ls` noise must not wipe a real agent session topic.
    const next = nextOscTitleFromIncoming(panes[paneId].oscTitle, oscTitle);
    if (panes[paneId].oscTitle === next) return;

    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [scopeKey]: {
          ...panes,
          [paneId]: {
            ...panes[paneId],
            oscTitle: next,
          },
        },
      },
    }));
    // Persisted in terminal layout (debounced by saveToBackend) so agent
    // session topics survive full page refresh — unlike dynamicTitle, which
    // is re-injected from tmux on attach (APP-047).
    get().saveToBackend(workspaceId);
  },

  setPaneAgent: (workspaceId, paneId, agent, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const panes = get().workspacePanes[scopeKey];
    if (!panes || !panes[paneId]) return;
    if (samePaneAgent(panes[paneId].agent, agent)) return;

    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [scopeKey]: {
          ...panes,
          [paneId]: {
            ...panes[paneId],
            agent,
          },
        },
      },
    }));
    get().saveToBackend(workspaceId);
  },

  setTabCustomTitle: (workspaceId, terminalTabId, title) => {
    const nextCustomTitle = normalizeCustomName(title);
    const tabs = getWorkspaceTerminalTabs(get(), workspaceId);
    const target = tabs.find((tab) => tab.id === terminalTabId);
    if (!target) return;
    if (target.customTitle === nextCustomTitle) return;

    set((state) => ({
      workspaceTerminalTabs: {
        ...state.workspaceTerminalTabs,
        [workspaceId]: getWorkspaceTerminalTabs(state, workspaceId).map((tab) =>
          tab.id === terminalTabId ? { ...tab, customTitle: nextCustomTitle } : tab,
        ),
      },
    }));
    get().saveToBackend(workspaceId);
  },

  setPaneCustomLabel: (workspaceId, paneId, label, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const panes = get().workspacePanes[scopeKey];
    if (!panes || !panes[paneId]) return;

    const nextCustomLabel = normalizeCustomName(label);
    if (panes[paneId].customLabel === nextCustomLabel) return;

    set((state) => {
      const currentPanes = state.workspacePanes[scopeKey] ?? panes;
      return {
        workspacePanes: {
          ...state.workspacePanes,
          [scopeKey]: {
            ...currentPanes,
            [paneId]: {
              ...currentPanes[paneId],
              customLabel: nextCustomLabel,
            },
          },
        },
      };
    });
    get().saveToBackend(workspaceId);
  },

  setPaneTitleFlags: (workspaceId, paneId, flags, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    const panes = get().workspacePanes[scopeKey];
    if (!panes || !panes[paneId]) return;

    const current = panes[paneId];
    const nextKeepAgentName = flags.keepAgentName ?? current.keepAgentName;
    const nextKeepCwd = flags.keepCwd ?? current.keepCwd;
    if (current.keepAgentName === nextKeepAgentName && current.keepCwd === nextKeepCwd) return;

    set((state) => {
      const currentPanes = state.workspacePanes[scopeKey] ?? panes;
      return {
        workspacePanes: {
          ...state.workspacePanes,
          [scopeKey]: {
            ...currentPanes,
            [paneId]: {
              ...currentPanes[paneId],
              keepAgentName: nextKeepAgentName,
              keepCwd: nextKeepCwd,
            },
          },
        },
      };
    });
    get().saveToBackend(workspaceId);
  },

  ...createTerminalAuxiliaryActions(set, get),
  });
});
