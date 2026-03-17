"use client";

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { MosaicNode, MosaicDirection, getLeaves } from "react-mosaic-component";
import { workspaceLayoutApi, projectLayoutApi, systemApi, TmuxWindow } from "@/api/rest-api";
import type { TerminalPaneProps } from "@/components/terminal/types";

const SAVE_DEBOUNCE_MS = 500;

interface TerminalStore {
  workspacePanes: Record<string, Record<string, TerminalPaneProps>>;
  workspaceLayouts: Record<string, MosaicNode<string> | null>;
  workspaceMaximizedIds: Record<string, string | null>;
  /** Track which workspaces have been loaded from backend */
  loadedWorkspaces: Set<string>;
  /** Track which workspaces are currently being initialized (loading from backend) */
  initializingWorkspaces: Set<string>;
  /** Track pending save operations */
  saveTimeouts: Record<string, NodeJS.Timeout>;
  /** Track if store is hydrated (client-side only) */
  isHydrated: boolean;
  /** Cache of existing tmux windows per workspace */
  tmuxWindowsCache: Record<string, TmuxWindow[]>;
  /** Track whether each workspaceId is actually a project context (used for API selection) */
  workspaceContexts: Record<string, boolean>;

  /** Project Wiki tab: separate panes/layout, does not affect main Terminal (Code workspace) */
  projectWikiPanes: Record<string, Record<string, TerminalPaneProps>>;
  projectWikiLayouts: Record<string, MosaicNode<string> | null>;
  projectWikiMaximizedIds: Record<string, string | null>;
  projectWikiLoadedWorkspaces: Set<string>;
  projectWikiInitializingWorkspaces: Set<string>;
  
  // Actions
  getPanes: (workspaceId: string) => Record<string, TerminalPaneProps>;
  getLayout: (workspaceId: string) => MosaicNode<string> | null;
  getPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string) => string | null;
  /** Check if workspace has been fully loaded and is ready for rendering */
  isWorkspaceReady: (workspaceId: string) => boolean;
  setLayout: (workspaceId: string, layout: MosaicNode<string> | null) => void;
  addTerminal: (workspaceId: string, title?: string) => string;
  removeTerminal: (workspaceId: string, id: string) => void;
  splitTerminal: (workspaceId: string, id: string, direction: MosaicDirection) => void;
  toggleMaximize: (workspaceId: string, id: string) => void;
  
  // Initialization
  initWorkspace: (workspaceId: string, isProjectContext?: boolean) => void;

  // Backend sync
  loadFromBackend: (workspaceId: string, isProjectContext?: boolean) => Promise<void>;
  saveToBackend: (workspaceId: string, isProjectContext?: boolean) => void;
  fetchTmuxWindows: (workspaceId: string) => Promise<TmuxWindow[]>;
  
  // Tmux window tracking
  setTmuxWindowName: (workspaceId: string, paneId: string, tmuxWindowName: string) => void;
  
  // Dynamic title (from shell shim OSC sequences)
  setDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string) => void;

  // Project Wiki scope (separate from main Terminal)
  getProjectWikiPanes: (workspaceId: string) => Record<string, TerminalPaneProps>;
  getProjectWikiLayout: (workspaceId: string) => MosaicNode<string> | null;
  isProjectWikiReady: (workspaceId: string) => boolean;
  setProjectWikiLayout: (workspaceId: string, layout: MosaicNode<string> | null) => void;
  addProjectWikiTerminal: (workspaceId: string, title?: string) => string;
  removeProjectWikiTerminal: (workspaceId: string, id: string) => void;
  splitProjectWikiTerminal: (workspaceId: string, id: string, direction: MosaicDirection) => void;
  initProjectWikiWorkspace: (workspaceId: string) => void;
  loadProjectWikiFromTmux: (workspaceId: string) => Promise<void>;
  getProjectWikiPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string) => string | null;
  setProjectWikiDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string) => void;
  toggleProjectWikiMaximize: (workspaceId: string, id: string) => void;

  // Code Review scope (separate from main Terminal and Project Wiki)
  codeReviewPanes: Record<string, Record<string, TerminalPaneProps>>;
  codeReviewLayouts: Record<string, MosaicNode<string> | null>;
  codeReviewMaximizedIds: Record<string, string | null>;
  codeReviewLoadedWorkspaces: Set<string>;
  codeReviewInitializingWorkspaces: Set<string>;
  getCodeReviewPanes: (workspaceId: string) => Record<string, TerminalPaneProps>;
  getCodeReviewLayout: (workspaceId: string) => MosaicNode<string> | null;
  isCodeReviewReady: (workspaceId: string) => boolean;
  setCodeReviewLayout: (workspaceId: string, layout: MosaicNode<string> | null) => void;
  addCodeReviewTerminal: (workspaceId: string, title?: string) => string;
  removeCodeReviewTerminal: (workspaceId: string, id: string) => void;
  initCodeReviewWorkspace: (workspaceId: string) => void;
  loadCodeReviewFromTmux: (workspaceId: string) => Promise<void>;
  getCodeReviewPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string) => string | null;
  setCodeReviewDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string) => void;
  toggleCodeReviewMaximize: (workspaceId: string, id: string) => void;
  splitCodeReviewTerminal: (workspaceId: string, id: string, direction: MosaicDirection) => void;
}

/** Generate next available window name (1, 2, 3, ...) for numeric names */
function getNextWindowName(existingPanes: Record<string, TerminalPaneProps>): string {
  const values = Object.values(existingPanes);
  const usedNames = new Set([
     ...values.map(p => p.tmuxWindowName),
     ...values.map(p => p.title)
  ].filter(Boolean));
  
  let num = 1;
  while (usedNames.has(String(num))) {
    num++;
  }
  return String(num);
}

/** Fixed tmux window name for Project Wiki - never gets -1/-2 suffix. Export for reuse. */
export const PROJECT_WIKI_WINDOW_NAME = "Generate Project Wiki";

/** Fixed tmux window name for Code Review - never gets -1/-2 suffix. Export for reuse. */
export const CODE_REVIEW_WINDOW_NAME = "Code Review";

/** Generate unique window name with suffix for agent windows (e.g., "Claude Code", "Claude Code-2") */
function getUniqueAgentName(baseName: string, existingPanes: Record<string, TerminalPaneProps>): string {
  // Project Wiki and Code Review use fixed names - always return as-is for attach/reuse
  if (baseName === PROJECT_WIKI_WINDOW_NAME || baseName === CODE_REVIEW_WINDOW_NAME) {
    return baseName;
  }

  const values = Object.values(existingPanes);
  const usedNames = new Set([
     ...values.map(p => p.tmuxWindowName),
     ...values.map(p => p.title)
  ].filter(Boolean));
  
  // If base name is not used, return it directly
  if (!usedNames.has(baseName)) {
    return baseName;
  }
  
  // Find next available suffix: baseName-2, baseName-3, ...
  let num = 2;
  while (usedNames.has(`${baseName}-${num}`)) {
    num++;
  }
  return `${baseName}-${num}`;
}

function createInitialLayout(workspaceId: string): { 
  panes: Record<string, TerminalPaneProps>, 
  layout: MosaicNode<string> 
} {
  const initialId = uuidv4();
  const windowName = "1";
  return {
    panes: {
      [initialId]: {
        id: initialId,
        title: windowName,
        sessionId: uuidv4(),
        workspaceId,
        tmuxWindowName: windowName,
        isNewPane: true, // Mark as new so Terminal creates instead of attaches
      },
    },
    layout: initialId,
  };
}

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  workspacePanes: {},
  workspaceLayouts: {},
  workspaceMaximizedIds: {},
  loadedWorkspaces: new Set(),
  initializingWorkspaces: new Set(),
  saveTimeouts: {},
  isHydrated: false,
  tmuxWindowsCache: {},
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

  getPanes: (workspaceId) => {
    const state = get();
    return state.workspacePanes[workspaceId] || {};
  },

  /** Find pane ID by tmux window name. Returns null if not found. */
  getPaneIdByTmuxWindowName: (workspaceId, tmuxWindowName) => {
    const panes = get().workspacePanes[workspaceId] || {};
    const entry = Object.entries(panes).find(([, p]) => p.tmuxWindowName === tmuxWindowName);
    return entry ? entry[0] : null;
  },

  getLayout: (workspaceId) => {
    const state = get();
    return state.workspaceLayouts[workspaceId] || null;
  },

  isWorkspaceReady: (workspaceId) => {
    const state = get();
    // Workspace is ready if it has been loaded and is not currently initializing
    return state.loadedWorkspaces.has(workspaceId) && !state.initializingWorkspaces.has(workspaceId);
  },

  setLayout: (workspaceId, layout) => {
    set((state) => ({
      workspaceLayouts: {
        ...state.workspaceLayouts,
        [workspaceId]: layout,
      },
    }));
    
    // Clean up panes that are no longer in the layout
    const currentPanes = get().workspacePanes[workspaceId] || {};
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
          [workspaceId]: nextPanes,
        },
      }));
    }

    // Debounced save to backend
    get().saveToBackend(workspaceId);
  },

  initWorkspace: (workspaceId, isProjectContext = false) => {
    const state = get();

    // Store the context type for this workspace (used in saveToBackend/loadFromBackend)
    if (state.workspaceContexts[workspaceId] !== isProjectContext) {
      set((state) => ({
        workspaceContexts: { ...state.workspaceContexts, [workspaceId]: isProjectContext },
      }));
    }

    // Skip if currently initializing (prevents React Strict Mode double-mount issues)
    if (state.initializingWorkspaces.has(workspaceId)) {
      return;
    }
    
    // If workspace was already loaded (user switching back to it), regenerate
    // sessionIds for all panes. This is critical to prevent a race condition:
    // when the user switches away, the old PTY threads asynchronously detach and
    // kill the old tmux client sessions (atmos_client_{sessionId}). If the user
    // switches back before that cleanup completes, reusing the same sessionId
    // causes the old cleanup to kill the newly created session, producing
    // "can't find session: atmos_client_xxx" errors in the terminal.
    // Fresh UUIDs guarantee no naming collision with ongoing cleanup.
    if (state.loadedWorkspaces.has(workspaceId)) {
      const panes = state.workspacePanes[workspaceId];
      if (panes && Object.keys(panes).length > 0) {
        const refreshedPanes: Record<string, TerminalPaneProps> = {};
        for (const [id, pane] of Object.entries(panes)) {
          refreshedPanes[id] = {
            ...pane,
            sessionId: uuidv4(),
          };
        }
        set((state) => ({
          workspacePanes: {
            ...state.workspacePanes,
            [workspaceId]: refreshedPanes,
          },
        }));
      }
      return;
    }
    
    // Mark as initializing to prevent duplicate calls
    set((state) => ({
      initializingWorkspaces: new Set([...state.initializingWorkspaces, workspaceId]),
    }));
    
    // Load from backend first, then create initial layout if nothing found
    // This prevents creating duplicate panes during async loading
    get().loadFromBackend(workspaceId, isProjectContext);
  },

  addTerminal: (workspaceId, title) => {
    const panes = get().workspacePanes[workspaceId] || {};
    const layout = get().workspaceLayouts[workspaceId];
    const newId = uuidv4();
    // For agent names (non-numeric), use unique suffix logic; otherwise use numeric names
    const windowName = title 
      ? getUniqueAgentName(title, panes) 
      : getNextWindowName(panes);
    
    const newPane: TerminalPaneProps = {
      id: newId,
      title: windowName,
      sessionId: uuidv4(),
      workspaceId,
      tmuxWindowName: windowName,
      isNewPane: true, // Mark as new so Terminal creates instead of attaches
    };

    const nextPanes = { ...panes, [newId]: newPane };
    
    let nextLayout: MosaicNode<string>;
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
        [workspaceId]: nextPanes,
      },
      workspaceLayouts: {
        ...state.workspaceLayouts,
        [workspaceId]: nextLayout,
      },
    }));

    get().saveToBackend(workspaceId);
    return newId;
  },

  removeTerminal: (workspaceId, id) => {
    const layout = get().workspaceLayouts[workspaceId];
    if (!layout) return;

    // A simpler way to remove by ID in Mosaic:
    const removeById = (node: MosaicNode<string> | null, targetId: string): MosaicNode<string> | null => {
      if (!node) return null;
      if (typeof node === 'string') {
        return node === targetId ? null : node;
      }
      const first = removeById(node.first, targetId);
      const second = removeById(node.second, targetId);
      
      if (!first) return second;
      if (!second) return first;
      
      return { ...node, first, second };
    };

    const updatedLayout = removeById(layout, id);
    
    if (!updatedLayout) {
      // If no terminals left, create a fresh one
      const { panes, layout: initialLayout } = createInitialLayout(workspaceId);
      set((state) => ({
        workspacePanes: {
          ...state.workspacePanes,
          [workspaceId]: panes,
        },
        workspaceLayouts: {
          ...state.workspaceLayouts,
          [workspaceId]: initialLayout,
        },
      }));
    } else {
      get().setLayout(workspaceId, updatedLayout);
    }
  },

  splitTerminal: (workspaceId, id, direction) => {
    const layout = get().workspaceLayouts[workspaceId];
    const panes = get().workspacePanes[workspaceId] || {};
    if (!layout) return;

    const newId = uuidv4();
    const windowName = getNextWindowName(panes);
    
    const newPane: TerminalPaneProps = {
      id: newId,
      title: windowName,
      sessionId: uuidv4(),
      workspaceId,
      tmuxWindowName: windowName,
      isNewPane: true, // Mark as new so Terminal creates instead of attaches
    };

    const nextPanes = { ...panes, [newId]: newPane };

    const splitById = (node: MosaicNode<string>, targetId: string): MosaicNode<string> => {
      if (typeof node === 'string') {
        if (node === targetId) {
          return {
            direction,
            first: node,
            second: newId,
          };
        }
        return node;
      }
      return {
        ...node,
        first: splitById(node.first, targetId),
        second: splitById(node.second, targetId),
      };
    };

    const nextLayout = splitById(layout, id);
    
    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [workspaceId]: nextPanes,
      },
      workspaceLayouts: {
        ...state.workspaceLayouts,
        [workspaceId]: nextLayout,
      },
    }));

    get().saveToBackend(workspaceId);
  },

  toggleMaximize: (workspaceId: string, id: string) => {
    const isProjectContext = get().workspaceContexts[workspaceId] || false;
    const layoutApi = isProjectContext ? projectLayoutApi : workspaceLayoutApi;

    set((state) => {
      const currentMaximizedId = state.workspaceMaximizedIds[workspaceId];
      const newMaximizedId = currentMaximizedId === id ? null : id;

      return {
        workspaceMaximizedIds: {
          ...state.workspaceMaximizedIds,
          [workspaceId]: newMaximizedId,
        },
      };
    });

    const maximizedId = get().workspaceMaximizedIds[workspaceId];
    layoutApi.updateMaximizedTerminalId(workspaceId, maximizedId).catch(err => {
      console.debug('Failed to save maximized terminal ID to backend:', err);
    });
  },

  fetchTmuxWindows: async (workspaceId) => {
    try {
      const response = await systemApi.listTmuxWindows(workspaceId);
      const windows = response.windows || [];
      
      // Cache the windows
      set((state) => ({
        tmuxWindowsCache: {
          ...state.tmuxWindowsCache,
          [workspaceId]: windows,
        },
      }));
      
      return windows;
    } catch (error) {
      console.debug('Failed to fetch tmux windows:', error);
      return [];
    }
  },

  loadFromBackend: async (workspaceId, isProjectContext = false) => {
    // Skip in SSR
    if (typeof window === 'undefined') return;

    const state = get();

    // Skip if already loaded
    if (state.loadedWorkspaces.has(workspaceId)) {
      // Remove from initializing if present
      if (state.initializingWorkspaces.has(workspaceId)) {
        set((state) => ({
          initializingWorkspaces: new Set([...state.initializingWorkspaces].filter(id => id !== workspaceId)),
        }));
      }
      return;
    }

    // Choose the correct API based on context
    const layoutApi = isProjectContext ? projectLayoutApi : workspaceLayoutApi;

    try {
      // Fetch layout and existing tmux windows independently —
      // layout API may 404 (workspace not yet persisted) but tmux windows
      // can still exist from a previous session.
      const [layoutResult, existingWindows] = await Promise.all([
        layoutApi.getLayout(workspaceId).catch(() => null),
        get().fetchTmuxWindows(workspaceId),
      ]);

      // Create a set of existing window names for quick lookup
      const existingWindowNames = new Set(existingWindows.map(w => w.name));

      const layoutResponse = layoutResult;

      if (layoutResponse?.layout) {
        const data = JSON.parse(layoutResponse.layout);
        // data.panes and data.layout
        let panes = data.panes as Record<string, TerminalPaneProps>;
        let layout = data.layout as MosaicNode<string> | null;

        // Compatibility check: if it's the old grid format
        if (!layout && data) {
           // Try to migrate or just use initial
           // If data has keys that look like panes but no 'layout' property
           const possiblePanes = data;
           if (Object.values(possiblePanes)[0]?.hasOwnProperty('grid')) {
              console.debug('Old grid layout detected, resetting to initial Mosaic layout');
              // Fall through to create initial layout below
              panes = {};
              layout = null;
           }
        }

        if (panes && layout && Object.keys(panes).length > 0) {
          // Validate and migrate panes
          const validatedPanes: Record<string, TerminalPaneProps> = {};
          for (const [id, pane] of Object.entries(panes)) {
            const windowName = pane.tmuxWindowName || pane.title || getNextWindowName(validatedPanes);
            const windowExists = existingWindowNames.has(windowName);

            validatedPanes[id] = {
              ...pane,
              workspaceId,
              title: windowName,
              tmuxWindowName: windowName,
              sessionId: uuidv4(),
              // If tmux window exists, attach to it (isNewPane: false)
              // If not, create a new one (isNewPane: true)
              isNewPane: !windowExists,
            };

            if (windowExists) {
              console.debug(`Reusing existing tmux window: ${windowName}`);
            } else {
              console.debug(`Will create new tmux window: ${windowName}`);
            }
          }

          set((state) => ({
            workspacePanes: {
              ...state.workspacePanes,
              [workspaceId]: validatedPanes,
            },
            workspaceLayouts: {
              ...state.workspaceLayouts,
              [workspaceId]: layout,
            },
            workspaceMaximizedIds: {
              ...state.workspaceMaximizedIds,
              [workspaceId]: layoutResponse.maximized_terminal_id || null,
            },
            loadedWorkspaces: new Set([...state.loadedWorkspaces, workspaceId]),
            initializingWorkspaces: new Set([...state.initializingWorkspaces].filter(id => id !== workspaceId)),
            isHydrated: true,
          }));
          return;
        }
      }

      // No saved layout, but tmux windows exist — attach to them
      // so scrollback history is preserved across page refreshes.
      if (existingWindows.length > 0) {
        console.debug('No saved layout, but found existing tmux windows:', existingWindows.map(w => w.name));
        const panes: Record<string, TerminalPaneProps> = {};
        const paneIds: string[] = [];
        for (const win of existingWindows) {
          const id = uuidv4();
          paneIds.push(id);
          panes[id] = {
            id,
            title: win.name,
            sessionId: uuidv4(),
            workspaceId,
            tmuxWindowName: win.name,
            isNewPane: false, // Attach to existing tmux window
          };
        }
        // Build a simple mosaic layout from the pane IDs
        let layout: MosaicNode<string> = paneIds[0];
        for (let i = 1; i < paneIds.length; i++) {
          layout = {
            direction: 'row',
            first: layout,
            second: paneIds[i],
            splitPercentage: Math.round(100 * i / (i + 1)),
          };
        }

        set((state) => ({
          workspacePanes: { ...state.workspacePanes, [workspaceId]: panes },
          workspaceLayouts: { ...state.workspaceLayouts, [workspaceId]: layout },
          workspaceMaximizedIds: { ...state.workspaceMaximizedIds, [workspaceId]: null },
          loadedWorkspaces: new Set([...state.loadedWorkspaces, workspaceId]),
          initializingWorkspaces: new Set([...state.initializingWorkspaces].filter(id => id !== workspaceId)),
          isHydrated: true,
        }));
        return;
      }
    } catch (error) {
      console.debug('Failed to load terminal layout from backend:', error);
    }

    // No saved layout found, create initial layout
    const { panes: initialPanes, layout: initialLayout } = createInitialLayout(workspaceId);
    
    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [workspaceId]: initialPanes,
      },
      workspaceLayouts: {
        ...state.workspaceLayouts,
        [workspaceId]: initialLayout,
      },
      workspaceMaximizedIds: {
        ...state.workspaceMaximizedIds,
        [workspaceId]: null,
      },
      loadedWorkspaces: new Set([...state.loadedWorkspaces, workspaceId]),
      initializingWorkspaces: new Set([...state.initializingWorkspaces].filter(id => id !== workspaceId)),
      isHydrated: true,
    }));
  },

  saveToBackend: (workspaceId) => {
    if (typeof window === 'undefined') return;

    const state = get();
    if (state.saveTimeouts[workspaceId]) {
      clearTimeout(state.saveTimeouts[workspaceId]);
    }

    const timeout = setTimeout(async () => {
      const currentState = get();
      const panes = currentState.workspacePanes[workspaceId];
      const layout = currentState.workspaceLayouts[workspaceId];
      const isProjectContext = currentState.workspaceContexts[workspaceId] || false;

      if (!panes || !layout) return;

      try {
        const cleanPanes: Record<string, Omit<TerminalPaneProps, 'sessionId' | 'dynamicTitle'>> = {};
        for (const [id, pane] of Object.entries(panes)) {
          // Strip transient fields that should not be persisted
          const { sessionId, dynamicTitle, ...rest } = pane;
          cleanPanes[id] = rest;
        }

        const layoutApi = isProjectContext ? projectLayoutApi : workspaceLayoutApi;
        await layoutApi.updateLayout(workspaceId, JSON.stringify({
          panes: cleanPanes,
          layout
        }));
      } catch (error) {
        console.debug('Failed to save terminal layout to backend:', error);
      }
    }, SAVE_DEBOUNCE_MS);
    
    set((state) => ({
      saveTimeouts: {
        ...state.saveTimeouts,
        [workspaceId]: timeout,
      },
    }));
  },

  setTmuxWindowName: (workspaceId, paneId, tmuxWindowName) => {
    const panes = get().workspacePanes[workspaceId];
    if (!panes || !panes[paneId]) return;
    
    const updatedPanes = {
      ...panes,
      [paneId]: {
        ...panes[paneId],
        tmuxWindowName,
        title: tmuxWindowName,
      },
    };
    
    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [workspaceId]: updatedPanes,
      },
    }));
    
    get().saveToBackend(workspaceId);
  },

  setDynamicTitle: (workspaceId, paneId, dynamicTitle) => {
    const panes = get().workspacePanes[workspaceId];
    if (!panes || !panes[paneId]) return;
    
    // Only update if the title actually changed (avoid unnecessary re-renders)
    if (panes[paneId].dynamicTitle === dynamicTitle) return;
    
    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [workspaceId]: {
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

  // --- Project Wiki scope (in-memory, does not affect main Terminal) ---
  getProjectWikiPanes: (workspaceId) => {
    return get().projectWikiPanes[workspaceId] || {};
  },
  getProjectWikiLayout: (workspaceId) => {
    return get().projectWikiLayouts[workspaceId] || null;
  },
  isProjectWikiReady: (workspaceId) => {
    const state = get();
    return state.projectWikiLoadedWorkspaces.has(workspaceId) && !state.projectWikiInitializingWorkspaces.has(workspaceId);
  },
  setProjectWikiLayout: (workspaceId, layout) => {
    set((state) => ({
      projectWikiLayouts: {
        ...state.projectWikiLayouts,
        [workspaceId]: layout,
      },
    }));
    const currentPanes = get().projectWikiPanes[workspaceId] || {};
    const leaves = layout ? getLeaves(layout) : [];
    const leafSet = new Set(leaves);
    const nextPanes: Record<string, TerminalPaneProps> = {};
    Object.keys(currentPanes).forEach(id => {
      if (leafSet.has(id)) nextPanes[id] = currentPanes[id];
    });
    set((state) => ({
      projectWikiPanes: {
        ...state.projectWikiPanes,
        [workspaceId]: nextPanes,
      },
    }));
  },
  addProjectWikiTerminal: (workspaceId, title = PROJECT_WIKI_WINDOW_NAME) => {
    const panes = get().projectWikiPanes[workspaceId] || {};
    const layout = get().projectWikiLayouts[workspaceId];
    const newId = uuidv4();
    const newPane: TerminalPaneProps = {
      id: newId,
      title,
      sessionId: uuidv4(),
      workspaceId,
      tmuxWindowName: title,
      isNewPane: true,
    };
    const nextPanes = { ...panes, [newId]: newPane };
    let nextLayout: MosaicNode<string>;
    if (!layout) {
      nextLayout = newId;
    } else {
      nextLayout = { direction: 'row', first: layout, second: newId };
    }
    set((state) => ({
      projectWikiPanes: { ...state.projectWikiPanes, [workspaceId]: nextPanes },
      projectWikiLayouts: { ...state.projectWikiLayouts, [workspaceId]: nextLayout },
      projectWikiLoadedWorkspaces: new Set([...state.projectWikiLoadedWorkspaces, workspaceId]),
    }));
    return newId;
  },
  splitProjectWikiTerminal: (workspaceId, id, direction) => {
    const layout = get().projectWikiLayouts[workspaceId];
    const panes = get().projectWikiPanes[workspaceId] || {};
    if (!layout) return;
    const newId = uuidv4();
    const newPane: TerminalPaneProps = {
      id: newId,
      title: PROJECT_WIKI_WINDOW_NAME + "-2",
      sessionId: uuidv4(),
      workspaceId,
      tmuxWindowName: PROJECT_WIKI_WINDOW_NAME + "-2",
      isNewPane: true,
    };
    const nextPanes = { ...panes, [newId]: newPane };
    const splitById = (node: MosaicNode<string>, targetId: string): MosaicNode<string> => {
      if (typeof node === 'string') {
        if (node === targetId) return { direction, first: node, second: newId };
        return node;
      }
      return {
        ...node,
        first: splitById(node.first, targetId),
        second: splitById(node.second, targetId),
      };
    };
    const nextLayout = splitById(layout, id);
    set((state) => ({
      projectWikiPanes: { ...state.projectWikiPanes, [workspaceId]: nextPanes },
      projectWikiLayouts: { ...state.projectWikiLayouts, [workspaceId]: nextLayout },
    }));
  },
  removeProjectWikiTerminal: (workspaceId, id) => {
    const layout = get().projectWikiLayouts[workspaceId];
    if (!layout) return;
    const removeById = (node: MosaicNode<string> | null, targetId: string): MosaicNode<string> | null => {
      if (!node) return null;
      if (typeof node === 'string') return node === targetId ? null : node;
      const first = removeById(node.first, targetId);
      const second = removeById(node.second, targetId);
      if (!first) return second;
      if (!second) return first;
      return { ...node, first, second };
    };
    const updatedLayout = removeById(layout, id);
    const panes = get().projectWikiPanes[workspaceId] || {};
    const nextPanes: Record<string, TerminalPaneProps> = {};
    if (updatedLayout) {
      const leafSet = new Set(getLeaves(updatedLayout));
      Object.entries(panes).forEach(([k, v]) => {
        if (leafSet.has(k)) nextPanes[k] = v;
      });
    }
    set((state) => ({
      projectWikiPanes: { ...state.projectWikiPanes, [workspaceId]: nextPanes },
      projectWikiLayouts: { ...state.projectWikiLayouts, [workspaceId]: updatedLayout },
    }));
  },
  initProjectWikiWorkspace: (workspaceId) => {
    const state = get();
    if (state.projectWikiLoadedWorkspaces.has(workspaceId)) return;
    if (state.projectWikiInitializingWorkspaces.has(workspaceId)) return;
    set((state) => ({
      projectWikiInitializingWorkspaces: new Set([...state.projectWikiInitializingWorkspaces, workspaceId]),
    }));
    get().loadProjectWikiFromTmux(workspaceId);
  },
  loadProjectWikiFromTmux: async (workspaceId) => {
    if (typeof window === 'undefined') return;
    try {
      const { exists } = await systemApi.checkProjectWikiWindow(workspaceId);
      const state = get();
      if (!state.projectWikiInitializingWorkspaces.has(workspaceId)) return; // init was reset
      if (exists) {
        const panes = state.projectWikiPanes[workspaceId] || {};
        const hasWikiPane = Object.values(panes).some(p => p.tmuxWindowName === PROJECT_WIKI_WINDOW_NAME);
        if (!hasWikiPane) {
          const newId = uuidv4();
          const newPane: TerminalPaneProps = {
            id: newId,
            title: PROJECT_WIKI_WINDOW_NAME,
            sessionId: uuidv4(),
            workspaceId,
            tmuxWindowName: PROJECT_WIKI_WINDOW_NAME,
            isNewPane: false, // Attach to existing tmux window
          };
          set((state) => ({
            projectWikiPanes: { ...state.projectWikiPanes, [workspaceId]: { ...panes, [newId]: newPane } },
            projectWikiLayouts: { ...state.projectWikiLayouts, [workspaceId]: newId },
            projectWikiLoadedWorkspaces: new Set([...state.projectWikiLoadedWorkspaces, workspaceId]),
            projectWikiInitializingWorkspaces: new Set([...state.projectWikiInitializingWorkspaces].filter(id => id !== workspaceId)),
          }));
          return;
        }
      }
      set((state) => ({
        projectWikiLoadedWorkspaces: new Set([...state.projectWikiLoadedWorkspaces, workspaceId]),
        projectWikiInitializingWorkspaces: new Set([...state.projectWikiInitializingWorkspaces].filter(id => id !== workspaceId)),
      }));
    } catch (err) {
      console.debug('Failed to load Project Wiki from tmux:', err);
      set((state) => ({
        projectWikiLoadedWorkspaces: new Set([...state.projectWikiLoadedWorkspaces, workspaceId]),
        projectWikiInitializingWorkspaces: new Set([...state.projectWikiInitializingWorkspaces].filter(id => id !== workspaceId)),
      }));
    }
  },
  getProjectWikiPaneIdByTmuxWindowName: (workspaceId, tmuxWindowName) => {
    const panes = get().projectWikiPanes[workspaceId] || {};
    const entry = Object.entries(panes).find(([, p]) => p.tmuxWindowName === tmuxWindowName);
    return entry ? entry[0] : null;
  },
  setProjectWikiDynamicTitle: (workspaceId, paneId, dynamicTitle) => {
    const panes = get().projectWikiPanes[workspaceId];
    if (!panes?.[paneId] || panes[paneId].dynamicTitle === dynamicTitle) return;
    set((state) => ({
      projectWikiPanes: {
        ...state.projectWikiPanes,
        [workspaceId]: {
          ...panes,
          [paneId]: { ...panes[paneId], dynamicTitle },
        },
      },
    }));
  },
  toggleProjectWikiMaximize: (workspaceId, id) => {
    set((state) => {
      const current = state.projectWikiMaximizedIds[workspaceId];
      const next = current === id ? null : id;
      return {
        projectWikiMaximizedIds: {
          ...state.projectWikiMaximizedIds,
          [workspaceId]: next,
        },
      };
    });
  },

  // ===== Code Review scope actions =====

  getCodeReviewPanes: (workspaceId) => get().codeReviewPanes[workspaceId] || {},
  getCodeReviewLayout: (workspaceId) => get().codeReviewLayouts[workspaceId] || null,
  isCodeReviewReady: (workspaceId) => {
    const state = get();
    return state.codeReviewLoadedWorkspaces.has(workspaceId) && !state.codeReviewInitializingWorkspaces.has(workspaceId);
  },
  setCodeReviewLayout: (workspaceId, layout) => {
    set((state) => ({
      codeReviewLayouts: { ...state.codeReviewLayouts, [workspaceId]: layout },
    }));
  },
  addCodeReviewTerminal: (workspaceId, title = CODE_REVIEW_WINDOW_NAME) => {
    const panes = get().codeReviewPanes[workspaceId] || {};
    const layout = get().codeReviewLayouts[workspaceId];
    const newId = uuidv4();
    const newPane: TerminalPaneProps = {
      id: newId,
      title,
      sessionId: uuidv4(),
      workspaceId,
      tmuxWindowName: title,
      isNewPane: true,
    };
    const nextPanes = { ...panes, [newId]: newPane };
    let nextLayout: MosaicNode<string>;
    if (!layout) {
      nextLayout = newId;
    } else {
      nextLayout = { direction: 'row', first: layout, second: newId };
    }
    set((state) => ({
      codeReviewPanes: { ...state.codeReviewPanes, [workspaceId]: nextPanes },
      codeReviewLayouts: { ...state.codeReviewLayouts, [workspaceId]: nextLayout },
      codeReviewLoadedWorkspaces: new Set([...state.codeReviewLoadedWorkspaces, workspaceId]),
    }));
    return newId;
  },
  removeCodeReviewTerminal: (workspaceId, id) => {
    const panes = get().codeReviewPanes[workspaceId] || {};
    const layout = get().codeReviewLayouts[workspaceId];
    const nextPanes = { ...panes };
    delete nextPanes[id];
    const removeFromLayout = (node: MosaicNode<string>): MosaicNode<string> | null => {
      if (typeof node === 'string') return node === id ? null : node;
      const first = removeFromLayout(node.first);
      const second = removeFromLayout(node.second);
      if (!first) return second;
      if (!second) return first;
      return { ...node, first, second };
    };
    const nextLayout = layout ? removeFromLayout(layout) : null;
    set((state) => ({
      codeReviewPanes: { ...state.codeReviewPanes, [workspaceId]: nextPanes },
      codeReviewLayouts: { ...state.codeReviewLayouts, [workspaceId]: nextLayout },
    }));
  },
  initCodeReviewWorkspace: (workspaceId) => {
    const state = get();
    if (state.codeReviewLoadedWorkspaces.has(workspaceId)) return;
    if (state.codeReviewInitializingWorkspaces.has(workspaceId)) return;
    set((state) => ({
      codeReviewInitializingWorkspaces: new Set([...state.codeReviewInitializingWorkspaces, workspaceId]),
    }));
    get().loadCodeReviewFromTmux(workspaceId);
  },
  loadCodeReviewFromTmux: async (workspaceId) => {
    if (typeof window === 'undefined') return;
    try {
      const { exists } = await systemApi.checkCodeReviewWindow(workspaceId);
      const state = get();
      if (!state.codeReviewInitializingWorkspaces.has(workspaceId)) return;
      if (exists) {
        const panes = state.codeReviewPanes[workspaceId] || {};
        const hasPane = Object.values(panes).some(p => p.tmuxWindowName === CODE_REVIEW_WINDOW_NAME);
        if (!hasPane) {
          const newId = uuidv4();
          const newPane: TerminalPaneProps = {
            id: newId,
            title: CODE_REVIEW_WINDOW_NAME,
            sessionId: uuidv4(),
            workspaceId,
            tmuxWindowName: CODE_REVIEW_WINDOW_NAME,
            isNewPane: false,
          };
          set((state) => ({
            codeReviewPanes: { ...state.codeReviewPanes, [workspaceId]: { ...panes, [newId]: newPane } },
            codeReviewLayouts: { ...state.codeReviewLayouts, [workspaceId]: newId },
            codeReviewLoadedWorkspaces: new Set([...state.codeReviewLoadedWorkspaces, workspaceId]),
            codeReviewInitializingWorkspaces: new Set([...state.codeReviewInitializingWorkspaces].filter(id => id !== workspaceId)),
          }));
          return;
        }
      }
      set((state) => ({
        codeReviewLoadedWorkspaces: new Set([...state.codeReviewLoadedWorkspaces, workspaceId]),
        codeReviewInitializingWorkspaces: new Set([...state.codeReviewInitializingWorkspaces].filter(id => id !== workspaceId)),
      }));
    } catch (err) {
      console.debug('Failed to load Code Review from tmux:', err);
      set((state) => ({
        codeReviewLoadedWorkspaces: new Set([...state.codeReviewLoadedWorkspaces, workspaceId]),
        codeReviewInitializingWorkspaces: new Set([...state.codeReviewInitializingWorkspaces].filter(id => id !== workspaceId)),
      }));
    }
  },
  getCodeReviewPaneIdByTmuxWindowName: (workspaceId, tmuxWindowName) => {
    const panes = get().codeReviewPanes[workspaceId] || {};
    const entry = Object.entries(panes).find(([, p]) => p.tmuxWindowName === tmuxWindowName);
    return entry ? entry[0] : null;
  },
  setCodeReviewDynamicTitle: (workspaceId, paneId, dynamicTitle) => {
    const panes = get().codeReviewPanes[workspaceId];
    if (!panes?.[paneId] || panes[paneId].dynamicTitle === dynamicTitle) return;
    set((state) => ({
      codeReviewPanes: {
        ...state.codeReviewPanes,
        [workspaceId]: {
          ...panes,
          [paneId]: { ...panes[paneId], dynamicTitle },
        },
      },
    }));
  },
  toggleCodeReviewMaximize: (workspaceId, id) => {
    set((state) => {
      const current = state.codeReviewMaximizedIds[workspaceId];
      const next = current === id ? null : id;
      return {
        codeReviewMaximizedIds: {
          ...state.codeReviewMaximizedIds,
          [workspaceId]: next,
        },
      };
    });
  },
  splitCodeReviewTerminal: (workspaceId, id, direction) => {
    const layout = get().codeReviewLayouts[workspaceId];
    const panes = get().codeReviewPanes[workspaceId] || {};
    if (!layout) return;
    const newId = uuidv4();
    const newPane: TerminalPaneProps = {
      id: newId,
      title: CODE_REVIEW_WINDOW_NAME + "-2",
      sessionId: uuidv4(),
      workspaceId,
      tmuxWindowName: CODE_REVIEW_WINDOW_NAME + "-2",
      isNewPane: true,
    };
    const nextPanes = { ...panes, [newId]: newPane };
    const splitById = (node: MosaicNode<string>, targetId: string): MosaicNode<string> => {
      if (typeof node === 'string') {
        if (node === targetId) return { direction, first: node, second: newId };
        return node;
      }
      return {
        ...node,
        first: splitById(node.first, targetId),
        second: splitById(node.second, targetId),
      };
    };
    const nextLayout = splitById(layout, id);
    set((state) => ({
      codeReviewPanes: { ...state.codeReviewPanes, [workspaceId]: nextPanes },
      codeReviewLayouts: { ...state.codeReviewLayouts, [workspaceId]: nextLayout },
    }));
  },
}));
