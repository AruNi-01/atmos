"use client";

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { MosaicNode, MosaicDirection, getLeaves } from "react-mosaic-component";
import { workspaceLayoutApi, systemApi, TmuxWindow } from "@/api/rest-api";
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
  
  // Actions
  getPanes: (workspaceId: string) => Record<string, TerminalPaneProps>;
  getLayout: (workspaceId: string) => MosaicNode<string> | null;
  /** Check if workspace has been fully loaded and is ready for rendering */
  isWorkspaceReady: (workspaceId: string) => boolean;
  setLayout: (workspaceId: string, layout: MosaicNode<string> | null) => void;
  addTerminal: (workspaceId: string, title?: string) => void;
  removeTerminal: (workspaceId: string, id: string) => void;
  splitTerminal: (workspaceId: string, id: string, direction: MosaicDirection) => void;
  toggleMaximize: (workspaceId: string, id: string) => void;
  
  // Initialization
  initWorkspace: (workspaceId: string) => void;
  
  // Backend sync
  loadFromBackend: (workspaceId: string) => Promise<void>;
  saveToBackend: (workspaceId: string) => void;
  fetchTmuxWindows: (workspaceId: string) => Promise<TmuxWindow[]>;
  
  // Tmux window tracking
  setTmuxWindowName: (workspaceId: string, paneId: string, tmuxWindowName: string) => void;
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

/** Generate unique window name with suffix for agent windows (e.g., "Claude Code", "Claude Code-2") */
function getUniqueAgentName(baseName: string, existingPanes: Record<string, TerminalPaneProps>): string {
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

  getPanes: (workspaceId) => {
    const state = get();
    return state.workspacePanes[workspaceId] || {};
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

  initWorkspace: (workspaceId) => {
    const state = get();
    
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
    get().loadFromBackend(workspaceId);
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
    workspaceLayoutApi.updateMaximizedTerminalId(workspaceId, maximizedId).catch(err => {
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

  loadFromBackend: async (workspaceId) => {
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

    try {
      // Fetch both layout and existing tmux windows in parallel
      const [layoutResponse, existingWindows] = await Promise.all([
        workspaceLayoutApi.getLayout(workspaceId),
        get().fetchTmuxWindows(workspaceId),
      ]);
      
      // Create a set of existing window names for quick lookup
      const existingWindowNames = new Set(existingWindows.map(w => w.name));
      
      if (layoutResponse.layout) {
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
      
      if (!panes || !layout) return;
      
      try {
        const cleanPanes: Record<string, Omit<TerminalPaneProps, 'sessionId'>> = {};
        for (const [id, pane] of Object.entries(panes)) {
          const { sessionId, ...rest } = pane;
          cleanPanes[id] = rest;
        }
        
        await workspaceLayoutApi.updateLayout(workspaceId, JSON.stringify({
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
}));
