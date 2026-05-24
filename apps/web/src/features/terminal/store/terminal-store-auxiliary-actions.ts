"use client";

import { v4 as uuidv4 } from "uuid";
import { getLeaves, type MosaicNode } from "react-mosaic-component";
import { systemApi } from "@/api/rest-api";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import {
  CODE_REVIEW_WINDOW_NAME,
  PROJECT_WIKI_WINDOW_NAME,
  createTerminalPane,
  removePaneFromLayout,
  samePaneAgent,
  splitPaneInLayout,
} from "@/features/terminal/store/terminal-store-helpers";
import type { TerminalStore } from "@/features/terminal/store/terminal-store-types";

type TerminalStoreSet = (
  partial:
    | Partial<TerminalStore>
    | TerminalStore
    | ((state: TerminalStore) => Partial<TerminalStore> | TerminalStore),
) => void;
type TerminalStoreGet = () => TerminalStore;

type AuxiliaryTerminalActions = Pick<
  TerminalStore,
  | "getProjectWikiPanes"
  | "getProjectWikiLayout"
  | "isProjectWikiReady"
  | "setProjectWikiLayout"
  | "addProjectWikiTerminal"
  | "removeProjectWikiTerminal"
  | "splitProjectWikiTerminal"
  | "initProjectWikiWorkspace"
  | "loadProjectWikiFromTmux"
  | "getProjectWikiPaneIdByTmuxWindowName"
  | "setProjectWikiDynamicTitle"
  | "setProjectWikiPaneAgent"
  | "markProjectWikiPaneAttached"
  | "toggleProjectWikiMaximize"
  | "getCodeReviewPanes"
  | "getCodeReviewLayout"
  | "isCodeReviewReady"
  | "setCodeReviewLayout"
  | "addCodeReviewTerminal"
  | "removeCodeReviewTerminal"
  | "initCodeReviewWorkspace"
  | "loadCodeReviewFromTmux"
  | "getCodeReviewPaneIdByTmuxWindowName"
  | "setCodeReviewDynamicTitle"
  | "setCodeReviewPaneAgent"
  | "markCodeReviewPaneAttached"
  | "toggleCodeReviewMaximize"
  | "splitCodeReviewTerminal"
>;

export function createTerminalAuxiliaryActions(
  set: TerminalStoreSet,
  get: TerminalStoreGet,
): AuxiliaryTerminalActions {
  return {
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
    addProjectWikiTerminal: (workspaceId, label = PROJECT_WIKI_WINDOW_NAME, agent) => {
      const panes = get().projectWikiPanes[workspaceId] || {};
      const layout = get().projectWikiLayouts[workspaceId];
      const newId = uuidv4();
      const newPane = createTerminalPane(workspaceId, label, {
        id: newId,
        tmuxWindowName: label,
        isNewPane: true,
        agent,
      });
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
    splitProjectWikiTerminal: (workspaceId, id, direction, agent) => {
      const layout = get().projectWikiLayouts[workspaceId];
      const panes = get().projectWikiPanes[workspaceId] || {};
      if (!layout) return null;
      const newId = uuidv4();
      const splitName = PROJECT_WIKI_WINDOW_NAME + "-2";
      const newPane = createTerminalPane(workspaceId, splitName, {
        id: newId,
        tmuxWindowName: splitName,
        isNewPane: true,
        agent,
      });
      const nextPanes = { ...panes, [newId]: newPane };
      const nextLayout = splitPaneInLayout(layout, id, newId, direction);
      set((state) => ({
        projectWikiPanes: { ...state.projectWikiPanes, [workspaceId]: nextPanes },
        projectWikiLayouts: { ...state.projectWikiLayouts, [workspaceId]: nextLayout },
      }));
      return newId;
    },
    removeProjectWikiTerminal: (workspaceId, id) => {
      const layout = get().projectWikiLayouts[workspaceId];
      if (!layout) return;
      const updatedLayout = removePaneFromLayout(layout, id);
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
            const newPane = createTerminalPane(workspaceId, PROJECT_WIKI_WINDOW_NAME, {
              id: newId,
              tmuxWindowName: PROJECT_WIKI_WINDOW_NAME,
              isNewPane: false,
            });
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
    markProjectWikiPaneAttached: (workspaceId, paneId) => {
      const panes = get().projectWikiPanes[workspaceId];
      const pane = panes?.[paneId];
      if (!pane || !pane.isNewPane) return;

      set((state) => ({
        projectWikiPanes: {
          ...state.projectWikiPanes,
          [workspaceId]: {
            ...state.projectWikiPanes[workspaceId],
            [paneId]: {
              ...pane,
              isNewPane: false,
            },
          },
        },
      }));
    },
    setProjectWikiPaneAgent: (workspaceId, paneId, agent) => {
      const panes = get().projectWikiPanes[workspaceId];
      if (!panes?.[paneId]) return;
      if (samePaneAgent(panes[paneId].agent, agent)) return;
      set((state) => ({
        projectWikiPanes: {
          ...state.projectWikiPanes,
          [workspaceId]: {
            ...panes,
            [paneId]: { ...panes[paneId], agent },
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
    addCodeReviewTerminal: (workspaceId, label = CODE_REVIEW_WINDOW_NAME, agent) => {
      const panes = get().codeReviewPanes[workspaceId] || {};
      const layout = get().codeReviewLayouts[workspaceId];
      const newId = uuidv4();
      const newPane = createTerminalPane(workspaceId, label, {
        id: newId,
        tmuxWindowName: label,
        isNewPane: true,
        agent,
      });
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
      const nextLayout = removePaneFromLayout(layout, id);
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
            const newPane = createTerminalPane(workspaceId, CODE_REVIEW_WINDOW_NAME, {
              id: newId,
              tmuxWindowName: CODE_REVIEW_WINDOW_NAME,
              isNewPane: false,
            });
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
    markCodeReviewPaneAttached: (workspaceId, paneId) => {
      const panes = get().codeReviewPanes[workspaceId];
      const pane = panes?.[paneId];
      if (!pane || !pane.isNewPane) return;

      set((state) => ({
        codeReviewPanes: {
          ...state.codeReviewPanes,
          [workspaceId]: {
            ...state.codeReviewPanes[workspaceId],
            [paneId]: {
              ...pane,
              isNewPane: false,
            },
          },
        },
      }));
    },
    setCodeReviewPaneAgent: (workspaceId, paneId, agent) => {
      const panes = get().codeReviewPanes[workspaceId];
      if (!panes?.[paneId]) return;
      if (samePaneAgent(panes[paneId].agent, agent)) return;
      set((state) => ({
        codeReviewPanes: {
          ...state.codeReviewPanes,
          [workspaceId]: {
            ...panes,
            [paneId]: { ...panes[paneId], agent },
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
    splitCodeReviewTerminal: (workspaceId, id, direction, agent) => {
      const layout = get().codeReviewLayouts[workspaceId];
      const panes = get().codeReviewPanes[workspaceId] || {};
      if (!layout) return null;
      const newId = uuidv4();
      const splitName = CODE_REVIEW_WINDOW_NAME + "-2";
      const newPane = createTerminalPane(workspaceId, splitName, {
        id: newId,
        tmuxWindowName: splitName,
        isNewPane: true,
        agent,
      });
      const nextPanes = { ...panes, [newId]: newPane };
      const nextLayout = splitPaneInLayout(layout, id, newId, direction);
      set((state) => ({
        codeReviewPanes: { ...state.codeReviewPanes, [workspaceId]: nextPanes },
        codeReviewLayouts: { ...state.codeReviewLayouts, [workspaceId]: nextLayout },
      }));
      return newId;
    },
  };
}
