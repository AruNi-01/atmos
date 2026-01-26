"use client";

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { workspaceLayoutApi } from "@/api/rest-api";

const GRID_TOTAL_ROWS = 48;
const SAVE_DEBOUNCE_MS = 500;

export interface GridTerminalPane {
  id: string;
  title: string;
  sessionId: string;
  workspaceId: string;
  /** tmux window index for reconnection */
  tmuxWindowIndex?: number;
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
  
  // Tmux window tracking
  setTmuxWindowIndex: (workspaceId: string, paneId: string, tmuxWindowIndex: number) => void;
}

function createInitialPanes(workspaceId: string): Record<string, GridTerminalPane> {
  const initialId = uuidv4();
  return {
    [initialId]: {
      id: initialId,
      title: "Terminal 1",
      sessionId: uuidv4(),
      workspaceId,
      grid: { x: 0, y: 0, w: 12, h: GRID_TOTAL_ROWS },
    },
  };
}

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  workspacePanes: {},
  loadedWorkspaces: new Set(),
  saveTimeouts: {},
  isHydrated: false,

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
      title: title || `Terminal ${panesList.length + 1}`,
      sessionId: uuidv4(),
      workspaceId,
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
      next[newId] = {
        id: newId,
        title: "Terminal 1",
        sessionId: uuidv4(),
        workspaceId,
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
    const next = { ...panes };

    if (direction === "vertical") {
      const newH = Math.max(1, Math.floor(target.grid.h / 2));
      next[id] = {
        ...target,
        grid: { ...target.grid, h: newH },
      };
      next[newId] = {
        id: newId,
        title: `Terminal ${Object.keys(panes).length + 1}`,
        sessionId: uuidv4(),
        workspaceId,
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
        title: `Terminal ${Object.keys(panes).length + 1}`,
        sessionId: uuidv4(),
        workspaceId,
        grid: { x: target.grid.x + newW, y: target.grid.y, w: newW, h: target.grid.h },
      };
    }
    
    get().setPanes(workspaceId, next);
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
      const response = await workspaceLayoutApi.getLayout(workspaceId);
      
      if (response.layout) {
        const panes = JSON.parse(response.layout) as Record<string, GridTerminalPane>;
        
        // Validate and migrate panes if needed
        const validatedPanes: Record<string, GridTerminalPane> = {};
        for (const [id, pane] of Object.entries(panes)) {
          validatedPanes[id] = {
            ...pane,
            workspaceId,
            // Generate new sessionId for reconnection (we'll attach to existing tmux window)
            sessionId: uuidv4(),
          };
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

  setTmuxWindowIndex: (workspaceId, paneId, tmuxWindowIndex) => {
    const panes = get().workspacePanes[workspaceId];
    if (!panes || !panes[paneId]) return;
    
    const updatedPanes = {
      ...panes,
      [paneId]: {
        ...panes[paneId],
        tmuxWindowIndex,
      },
    };
    
    get().setPanes(workspaceId, updatedPanes);
  },
}));
