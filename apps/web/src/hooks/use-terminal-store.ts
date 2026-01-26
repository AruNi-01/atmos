"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

const GRID_Total_ROWS = 48;

interface GridTerminalPane {
  id: string;
  title: string;
  sessionId: string;
  workspaceId: string;
  grid: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

interface TerminalStore {
  workspacePanes: Record<string, Record<string, GridTerminalPane>>;
  
  // Actions
  getPanes: (workspaceId: string) => Record<string, GridTerminalPane>;
  setPanes: (workspaceId: string, panes: Record<string, GridTerminalPane>) => void;
  addTerminal: (workspaceId: string, title?: string) => void;
  removeTerminal: (workspaceId: string, id: string) => void;
  splitTerminal: (workspaceId: string, id: string, direction: "horizontal" | "vertical") => void;
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => ({
      workspacePanes: {},

      getPanes: (workspaceId) => {
        const state = get();
        if (state.workspacePanes[workspaceId]) {
          return state.workspacePanes[workspaceId];
        }
        
        // Initial state for new workspace
        const initialId = uuidv4();
        const initialPanes = {
          [initialId]: {
            id: initialId,
            title: "Terminal 1",
            sessionId: uuidv4(),
            workspaceId,
            grid: { x: 0, y: 0, w: 12, h: GRID_Total_ROWS },
          },
        };
        
        // Don't set state during get to avoid render loops, just return initial
        return initialPanes;
      },

      setPanes: (workspaceId, panes) => {
        set((state) => ({
          workspacePanes: {
            ...state.workspacePanes,
            [workspaceId]: panes,
          },
        }));
      },

      addTerminal: (workspaceId, title) => {
        const panes = get().getPanes(workspaceId);
        const panesList = Object.values(panes);
        const lastPane = panesList[panesList.length - 1];
        const newId = uuidv4();
        
        let newGrid = { x: 0, y: 0, w: 6, h: GRID_Total_ROWS };
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
        const panes = get().getPanes(workspaceId);
        const next = { ...panes };
        delete next[id];
        
        if (Object.keys(next).length === 0) {
          const newId = uuidv4();
          next[newId] = {
            id: newId,
            title: "Terminal 1",
            sessionId: uuidv4(),
            workspaceId,
            grid: { x: 0, y: 0, w: 12, h: GRID_Total_ROWS },
          };
        }
        
        get().setPanes(workspaceId, next);
      },

      splitTerminal: (workspaceId, id, direction) => {
        const panes = get().getPanes(workspaceId);
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
    }),
    {
      name: "atmos-terminal-storage",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
