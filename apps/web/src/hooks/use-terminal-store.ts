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
  /** Track which workspaces have been loaded from backend */
  loadedWorkspaces: Set<string>;
  /** Track pending save operations */
  saveTimeouts: Record<string, NodeJS.Timeout>;
  /** Track if store is hydrated (client-side only) */
  isHydrated: boolean;
  /** Cache of existing tmux windows per workspace */
  tmuxWindowsCache: Record<string, TmuxWindow[]>;
  
  // Actions
  getPanes: (workspaceId: string) => Record<string, TerminalPaneProps>;
  getLayout: (workspaceId: string) => MosaicNode<string> | null;
  setLayout: (workspaceId: string, layout: MosaicNode<string> | null) => void;
  addTerminal: (workspaceId: string, title?: string) => void;
  removeTerminal: (workspaceId: string, id: string) => void;
  splitTerminal: (workspaceId: string, id: string, direction: MosaicDirection) => void;
  
  // Initialization
  initWorkspace: (workspaceId: string) => void;
  
  // Backend sync
  loadFromBackend: (workspaceId: string) => Promise<void>;
  saveToBackend: (workspaceId: string) => void;
  fetchTmuxWindows: (workspaceId: string) => Promise<TmuxWindow[]>;
  
  // Tmux window tracking
  setTmuxWindowName: (workspaceId: string, paneId: string, tmuxWindowName: string) => void;
}

/** Generate next available window name (1, 2, 3, ...) */
function getNextWindowName(existingPanes: Record<string, TerminalPaneProps>): string {
  const usedNames = new Set(Object.values(existingPanes).map(p => p.tmuxWindowName).filter(Boolean));
  let num = 1;
  while (usedNames.has(String(num))) {
    num++;
  }
  return String(num);
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
      },
    },
    layout: initialId,
  };
}

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  workspacePanes: {},
  workspaceLayouts: {},
  loadedWorkspaces: new Set(),
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
    
    // Skip if already initialized
    if (state.workspaceLayouts[workspaceId]) {
      return;
    }
    
    // Create initial layout on client side only
    const { panes, layout } = createInitialLayout(workspaceId);
    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [workspaceId]: panes,
      },
      workspaceLayouts: {
        ...state.workspaceLayouts,
        [workspaceId]: layout,
      },
      isHydrated: true,
    }));
    
    // Try to load from backend (will replace initial panes if found)
    get().loadFromBackend(workspaceId);
  },

  addTerminal: (workspaceId, title) => {
    const panes = get().workspacePanes[workspaceId] || {};
    const layout = get().workspaceLayouts[workspaceId];
    const newId = uuidv4();
    const windowName = title || getNextWindowName(panes);
    
    const newPane: TerminalPaneProps = {
      id: newId,
      title: windowName,
      sessionId: uuidv4(),
      workspaceId,
      tmuxWindowName: windowName,
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
              return; // Let initWorkspace handle it or use initial
           }
        }
        
        if (panes && layout) {
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
            };
            
            if (windowExists) {
              console.debug(`Reusing existing tmux window: ${windowName}`);
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
            loadedWorkspaces: new Set([...state.loadedWorkspaces, workspaceId]),
          }));
          return;
        }
      }
    } catch (error) {
      console.debug('Failed to load terminal layout from backend:', error);
    }

    set((state) => ({
      loadedWorkspaces: new Set([...state.loadedWorkspaces, workspaceId]),
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
