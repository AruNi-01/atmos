"use client";

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { workspaceLayoutApi, systemApi, TmuxWindow } from "@/api/rest-api";

const GRID_TOTAL_ROWS = 48;
const SAVE_DEBOUNCE_MS = 500;

export interface GridTerminalPane {
  id: string;
  title: string;
  sessionId: string;
  workspaceId: string;
  /** tmux window name for reconnection (e.g., "1", "2", "3") */
  tmuxWindowName?: string;
  grid: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

interface TerminalStore {
  workspacePanes: Record<string, Record<string, GridTerminalPane>>;
  /** Track which workspaces have been loaded from backend */
  loadedWorkspaces: Set<string>;
  /** Track pending save operations */
  saveTimeouts: Record<string, NodeJS.Timeout>;
  /** Track if store is hydrated (client-side only) */
  isHydrated: boolean;
  /** Cache of existing tmux windows per workspace */
  tmuxWindowsCache: Record<string, TmuxWindow[]>;
  
  // Actions
  getPanes: (workspaceId: string) => Record<string, GridTerminalPane>;
  setPanes: (workspaceId: string, panes: Record<string, GridTerminalPane>) => void;
  addTerminal: (workspaceId: string, title?: string) => void;
  removeTerminal: (workspaceId: string, id: string) => void;
  splitTerminal: (workspaceId: string, id: string, direction: "horizontal" | "vertical") => void;
  
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
function getNextWindowName(existingPanes: Record<string, GridTerminalPane>): string {
  const usedNames = new Set(Object.values(existingPanes).map(p => p.tmuxWindowName).filter(Boolean));
  let num = 1;
  while (usedNames.has(String(num))) {
    num++;
  }
  return String(num);
}

function createInitialPanes(workspaceId: string): Record<string, GridTerminalPane> {
  const initialId = uuidv4();
  const windowName = "1";
  return {
    [initialId]: {
      id: initialId,
      title: windowName,
      sessionId: uuidv4(),
      workspaceId,
      tmuxWindowName: windowName,
      grid: { x: 0, y: 0, w: 12, h: GRID_TOTAL_ROWS },
    },
  };
}

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  workspacePanes: {},
  loadedWorkspaces: new Set(),
  saveTimeouts: {},
  isHydrated: false,
  tmuxWindowsCache: {},

  getPanes: (workspaceId) => {
    const state = get();
    
    // Return existing panes if available
    if (state.workspacePanes[workspaceId]) {
      return state.workspacePanes[workspaceId];
    }
    
    // Return empty object during SSR or before hydration
    // The actual initialization happens via initWorkspace
    return {};
  },

  initWorkspace: (workspaceId) => {
    const state = get();
    
    // Skip if already initialized
    if (state.workspacePanes[workspaceId]) {
      return;
    }
    
    // Create initial panes on client side only
    const initialPanes = createInitialPanes(workspaceId);
    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [workspaceId]: initialPanes,
      },
      isHydrated: true,
    }));
    
    // Try to load from backend (will replace initial panes if found)
    get().loadFromBackend(workspaceId);
  },

  setPanes: (workspaceId, panes) => {
    set((state) => ({
      workspacePanes: {
        ...state.workspacePanes,
        [workspaceId]: panes,
      },
    }));
    
    // Debounced save to backend
    get().saveToBackend(workspaceId);
  },

  addTerminal: (workspaceId, title) => {
    const panes = get().workspacePanes[workspaceId] || {};
    const panesList = Object.values(panes);
    const lastPane = panesList[panesList.length - 1];
    const newId = uuidv4();
    const windowName = title || getNextWindowName(panes);
    
    let newGrid = { x: 0, y: 0, w: 6, h: GRID_TOTAL_ROWS };
    const next = { ...panes };
    
    if (lastPane) {
       const halfHeight = Math.max(1, Math.floor(lastPane.grid.h / 2));
       next[lastPane.id] = {
         ...lastPane,
         grid: { ...lastPane.grid, h: halfHeight }
       };
       newGrid = {
         x: lastPane.grid.x,
         y: lastPane.grid.y + halfHeight,
         w: lastPane.grid.w,
         h: halfHeight
       };
    }

    next[newId] = {
      id: newId,
      title: windowName,
      sessionId: uuidv4(),
      workspaceId,
      tmuxWindowName: windowName,
      grid: newGrid,
    };

    get().setPanes(workspaceId, next);
  },

  removeTerminal: (workspaceId, id) => {
    const panes = get().workspacePanes[workspaceId] || {};
    const next = { ...panes };
    delete next[id];
    
    if (Object.keys(next).length === 0) {
      const newId = uuidv4();
      const windowName = "1";
      next[newId] = {
        id: newId,
        title: windowName,
        sessionId: uuidv4(),
        workspaceId,
        tmuxWindowName: windowName,
        grid: { x: 0, y: 0, w: 12, h: GRID_TOTAL_ROWS },
      };
    }
    
    get().setPanes(workspaceId, next);
  },

  splitTerminal: (workspaceId, id, direction) => {
    const panes = get().workspacePanes[workspaceId] || {};
    const target = panes[id];
    if (!target) return;

    const newId = uuidv4();
    const windowName = getNextWindowName(panes);
    const next = { ...panes };

    if (direction === "vertical") {
      const newH = Math.max(1, Math.floor(target.grid.h / 2));
      next[id] = {
        ...target,
        grid: { ...target.grid, h: newH },
      };
      next[newId] = {
        id: newId,
        title: windowName,
        sessionId: uuidv4(),
        workspaceId,
        tmuxWindowName: windowName,
        grid: { x: target.grid.x, y: target.grid.y + newH, w: target.grid.w, h: newH },
      };
    } else {
      const newW = Math.max(1, Math.floor(target.grid.w / 2));
      next[id] = {
        ...target,
        grid: { ...target.grid, w: newW },
      };
      next[newId] = {
        id: newId,
        title: windowName,
        sessionId: uuidv4(),
        workspaceId,
        tmuxWindowName: windowName,
        grid: { x: target.grid.x + newW, y: target.grid.y, w: newW, h: target.grid.h },
      };
    }
    
    get().setPanes(workspaceId, next);
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
        const panes = JSON.parse(layoutResponse.layout) as Record<string, GridTerminalPane>;
        
        // Validate and migrate panes
        const validatedPanes: Record<string, GridTerminalPane> = {};
        for (const [id, pane] of Object.entries(panes)) {
          // Ensure tmuxWindowName is set (migrate from old format if needed)
          const windowName = pane.tmuxWindowName || pane.title || getNextWindowName(validatedPanes);
          
          // Check if this window exists in tmux - if so, we'll reuse it
          const windowExists = existingWindowNames.has(windowName);
          
          validatedPanes[id] = {
            ...pane,
            workspaceId,
            title: windowName,
            tmuxWindowName: windowName,
            // Generate new sessionId for reconnection
            sessionId: uuidv4(),
          };
          
          if (windowExists) {
            console.debug(`Reusing existing tmux window: ${windowName}`);
          }
        }
        
        if (Object.keys(validatedPanes).length > 0) {
          set((state) => ({
            workspacePanes: {
              ...state.workspacePanes,
              [workspaceId]: validatedPanes,
            },
            loadedWorkspaces: new Set([...state.loadedWorkspaces, workspaceId]),
          }));
          return;
        }
      }
    } catch (error) {
      // Silently fail - backend may not be running or workspace doesn't exist yet
      console.debug('Failed to load terminal layout from backend:', error);
    }

    // Mark as loaded even if no data found
    set((state) => ({
      loadedWorkspaces: new Set([...state.loadedWorkspaces, workspaceId]),
    }));
  },

  saveToBackend: (workspaceId) => {
    // Skip in SSR
    if (typeof window === 'undefined') return;
    
    const state = get();
    
    // Clear existing timeout for this workspace
    if (state.saveTimeouts[workspaceId]) {
      clearTimeout(state.saveTimeouts[workspaceId]);
    }
    
    // Set new debounced save
    const timeout = setTimeout(async () => {
      const currentState = get();
      const panes = currentState.workspacePanes[workspaceId];
      
      if (!panes || Object.keys(panes).length === 0) return;
      
      try {
        // Remove sessionId from saved data (it's regenerated on load)
        // Keep tmuxWindowName for window reuse on reconnection
        const cleanPanes: Record<string, Omit<GridTerminalPane, 'sessionId'> & { sessionId?: string }> = {};
        for (const [id, pane] of Object.entries(panes)) {
          const { sessionId, ...rest } = pane;
          cleanPanes[id] = rest;
        }
        
        await workspaceLayoutApi.updateLayout(workspaceId, JSON.stringify(cleanPanes));
      } catch (error) {
        // Silently fail - backend may not be running
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
        title: tmuxWindowName, // Keep title in sync
      },
    };
    
    get().setPanes(workspaceId, updatedPanes);
  },
}));
