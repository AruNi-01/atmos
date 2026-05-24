"use client";

import { v4 as uuidv4 } from "uuid";
import type { MosaicDirection, MosaicNode } from "react-mosaic-component";

import type { TmuxWindow } from "@/api/rest-api";
import type { TerminalPaneAgent, TerminalPaneProps } from "@/features/terminal/types/index";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_LAYOUT_SCHEMA,
  type PersistedTerminalPane,
  type PersistedTerminalTabDocument,
  type PersistedTerminalWorkspaceLayoutDocument,
} from "@/features/terminal/lib/terminal-layout-document";

export const TERMINAL_TAB_VALUE_PREFIX = "terminal-tab:";

export interface TerminalCenterTab {
  id: string;
  title: string;
  closable: boolean;
}

type TerminalLookupState = {
  workspaceTerminalTabs: Record<string, TerminalCenterTab[]>;
  workspacePanes: Record<string, Record<string, TerminalPaneProps>>;
  persistedTerminalLayouts: Record<string, PersistedTerminalWorkspaceLayoutDocument | null>;
};

type TerminalRuntimeEvictState = TerminalLookupState & {
  workspaceActiveTerminalTabIds: Record<string, string>;
  workspaceLayouts: Record<string, MosaicNode<string> | null>;
  workspaceMaximizedIds: Record<string, string | null>;
  loadedWorkspaces: Set<string>;
  hydratedTerminalScopes: Set<string>;
  initializingWorkspaces: Set<string>;
  initializingTerminalScopes: Set<string>;
  saveTimeouts: Record<string, NodeJS.Timeout>;
  isHydrated: boolean;
  tmuxWindowsCache: Record<string, TmuxWindow[]>;
  workspaceContexts: Record<string, boolean>;
  projectWikiPanes: Record<string, Record<string, TerminalPaneProps>>;
  projectWikiLayouts: Record<string, MosaicNode<string> | null>;
  projectWikiMaximizedIds: Record<string, string | null>;
  projectWikiLoadedWorkspaces: Set<string>;
  projectWikiInitializingWorkspaces: Set<string>;
  codeReviewPanes: Record<string, Record<string, TerminalPaneProps>>;
  codeReviewLayouts: Record<string, MosaicNode<string> | null>;
  codeReviewMaximizedIds: Record<string, string | null>;
  codeReviewLoadedWorkspaces: Set<string>;
  codeReviewInitializingWorkspaces: Set<string>;
};

type TerminalPersistenceState = TerminalLookupState & {
  workspaceActiveTerminalTabIds: Record<string, string>;
  workspaceLayouts: Record<string, MosaicNode<string> | null>;
  workspaceMaximizedIds: Record<string, string | null>;
};

/** Generate next available window name (1, 2, 3, ...) for numeric names */
export function getNextWindowName(existingPanes: Record<string, TerminalPaneProps>): string {
  const values = Object.values(existingPanes);
  const usedNames = new Set([
    ...values.map((pane) => pane.tmuxWindowName),
    ...values.map((pane) => pane.label),
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
export function getUniqueAgentName(
  baseName: string,
  existingPanes: Record<string, TerminalPaneProps>,
): string {
  // Project Wiki and Code Review use fixed names - always return as-is for attach/reuse
  if (baseName === PROJECT_WIKI_WINDOW_NAME || baseName === CODE_REVIEW_WINDOW_NAME) {
    return baseName;
  }

  const values = Object.values(existingPanes);
  const usedNames = new Set([
    ...values.map((pane) => pane.tmuxWindowName),
    ...values.map((pane) => pane.label),
  ].filter(Boolean));

  if (!usedNames.has(baseName)) {
    return baseName;
  }

  let num = 2;
  while (usedNames.has(`${baseName}-${num}`)) {
    num++;
  }
  return `${baseName}-${num}`;
}

export function createFixedTerminalTab(): TerminalCenterTab {
  return {
    id: FIXED_TERMINAL_TAB_VALUE,
    title: "Term",
    closable: false,
  };
}

export function createTerminalPane(
  workspaceId: string,
  label: string,
  options: {
    id?: string;
    tmuxWindowName?: string;
    isNewPane: boolean;
    agent?: TerminalPaneAgent;
  },
): TerminalPaneProps {
  return {
    id: options.id ?? uuidv4(),
    label,
    sessionId: uuidv4(),
    workspaceId,
    tmuxWindowName: options.tmuxWindowName ?? label,
    isNewPane: options.isNewPane,
    agent: options.agent,
  };
}

export function samePaneAgent(
  left: TerminalPaneAgent | undefined,
  right: TerminalPaneAgent,
): boolean {
  return (
    left?.id === right.id &&
    left?.label === right.label &&
    left?.command === right.command &&
    left?.iconType === right.iconType &&
    left?.pipeCommand === right.pipeCommand
  );
}

export function getScopeKey(
  workspaceId: string,
  terminalTabId: string = FIXED_TERMINAL_TAB_VALUE,
): string {
  return terminalTabId === FIXED_TERMINAL_TAB_VALUE
    ? workspaceId
    : `${workspaceId}::${terminalTabId}`;
}

export function getWorkspaceTerminalTabs(
  state: Pick<TerminalLookupState, "workspaceTerminalTabs">,
  workspaceId: string,
): TerminalCenterTab[] {
  return state.workspaceTerminalTabs[workspaceId] || [createFixedTerminalTab()];
}

/**
 * Locate a pane in the main workspace terminal grid by its tmux window name (any tab).
 *
 * Checks hydrated panes first; falls back to the persisted layout so deep
 * links (e.g. the footer agent-status jump) can resolve the owning tab even
 * before the workspace's non-active tabs have been mounted/hydrated.
 */
export function findWorkspacePaneIdsByTmuxWindowName(
  state: TerminalLookupState,
  workspaceId: string,
  tmuxWindowName: string,
): { paneId: string; terminalTabId: string } | null {
  const tabs = getWorkspaceTerminalTabs(state, workspaceId);
  for (const tab of tabs) {
    const scopeKey = getScopeKey(workspaceId, tab.id);
    const panes = state.workspacePanes[scopeKey];
    if (!panes) continue;
    for (const [paneId, pane] of Object.entries(panes)) {
      if (pane.tmuxWindowName === tmuxWindowName) {
        return { paneId, terminalTabId: tab.id };
      }
    }
  }

  const persistedTabs = state.persistedTerminalLayouts[workspaceId]?.tabs;
  if (persistedTabs) {
    for (const tab of persistedTabs) {
      for (const [paneId, pane] of Object.entries(tab.panes ?? {})) {
        const legacyTitle = (pane as unknown as { title?: string }).title;
        const windowName = pane.tmuxWindowName || pane.label || legacyTitle;
        if (windowName === tmuxWindowName) {
          return { paneId, terminalTabId: tab.id };
        }
      }
    }
  }

  return null;
}

/** Read transient title + agent for a pane in the main grid (by pane id). */
export function getWorkspacePaneFieldsByPaneId(
  state: Pick<TerminalLookupState, "workspacePanes">,
  workspaceId: string,
  paneId: string,
  terminalTabId: string = FIXED_TERMINAL_TAB_VALUE,
): { dynamicTitle?: string; agent?: TerminalPaneAgent } {
  const scopeKey = getScopeKey(workspaceId, terminalTabId);
  const pane = state.workspacePanes[scopeKey]?.[paneId];
  if (!pane) return {};
  return { dynamicTitle: pane.dynamicTitle, agent: pane.agent };
}

/** Read transient title + agent for a tmux-attached pane (same fields the mosaic uses). */
export function getWorkspacePaneLiveFieldsByTmuxWindow(
  state: TerminalLookupState,
  workspaceId: string,
  tmuxWindowName: string,
): { dynamicTitle?: string; agent?: TerminalPaneAgent } {
  const hit = findWorkspacePaneIdsByTmuxWindowName(state, workspaceId, tmuxWindowName);
  if (!hit) return {};
  const scopeKey = getScopeKey(workspaceId, hit.terminalTabId);
  const pane = state.workspacePanes[scopeKey]?.[hit.paneId];
  if (!pane) return {};
  return { dynamicTitle: pane.dynamicTitle, agent: pane.agent };
}

export function getAllDefaultPanesForWorkspace(
  state: TerminalLookupState,
  workspaceId: string,
): Record<string, TerminalPaneProps> {
  const tabs = getWorkspaceTerminalTabs(state, workspaceId);
  const persistedTabs = state.persistedTerminalLayouts[workspaceId]?.tabs ?? [];
  return tabs.reduce<Record<string, TerminalPaneProps>>((acc, tab) => {
    const scopeKey = getScopeKey(workspaceId, tab.id);
    const hydratedPanes = state.workspacePanes[scopeKey];

    if (hydratedPanes && Object.keys(hydratedPanes).length > 0) {
      Object.assign(acc, hydratedPanes);
      return acc;
    }

    const persistedTab = persistedTabs.find((persisted) => persisted.id === tab.id);
    if (!persistedTab?.panes) {
      return acc;
    }

    for (const [id, pane] of Object.entries(persistedTab.panes)) {
      acc[id] = {
        ...pane,
        workspaceId,
        sessionId: "",
      } as TerminalPaneProps;
    }

    return acc;
  }, {});
}

export function getNextTerminalTabTitle(existingTabs: TerminalCenterTab[]): string {
  const usedTitles = new Set(existingTabs.map((tab) => tab.title));
  let index = 1;
  while (usedTitles.has(`Term - ${index}`)) {
    index++;
  }
  return `Term - ${index}`;
}

export function hydratePersistedTab(
  workspaceId: string,
  tab: PersistedTerminalTabDocument,
  existingWindowNames: Set<string>,
): {
  panes: Record<string, TerminalPaneProps>;
  layout: MosaicNode<string> | null;
  maximizedTerminalId: string | null;
} | null {
  if (!tab.layout || !tab.panes || Object.keys(tab.panes).length === 0) {
    return null;
  }

  const validatedPanes: Record<string, TerminalPaneProps> = {};
  for (const [id, pane] of Object.entries(tab.panes)) {
    // `title` is the legacy field name (before the label/tmuxWindowName split).
    // Fall back to it so old persisted layouts still resolve the correct window name.
    const legacyTitle = (pane as unknown as { title?: string }).title;
    const windowName = pane.tmuxWindowName || pane.label || legacyTitle || getNextWindowName(validatedPanes);
    const windowExists = existingWindowNames.has(windowName);

    validatedPanes[id] = {
      ...pane,
      workspaceId,
      // Ensure label is always set — old data only has `title`, not `label`.
      label: pane.label || legacyTitle || windowName,
      tmuxWindowName: windowName,
      sessionId: uuidv4(),
      isNewPane: !windowExists,
    };
  }

  return {
    panes: validatedPanes,
    layout: tab.layout,
    maximizedTerminalId: tab.maximizedTerminalId || null,
  };
}

export function createInitialLayout(
  workspaceId: string,
  existingPanes: Record<string, TerminalPaneProps> = {},
): {
  panes: Record<string, TerminalPaneProps>;
  layout: MosaicNode<string>;
} {
  const initialId = uuidv4();
  const windowName =
    Object.keys(existingPanes).length > 0 ? getNextWindowName(existingPanes) : "1";
  return {
    panes: {
      [initialId]: createTerminalPane(workspaceId, windowName, {
        id: initialId,
        tmuxWindowName: windowName,
        isNewPane: true,
      }),
    },
    layout: initialId,
  };
}

export function createLayoutFromTmuxWindows(
  workspaceId: string,
  windows: TmuxWindow[],
): {
  panes: Record<string, TerminalPaneProps>;
  layout: MosaicNode<string>;
} | null {
  if (windows.length === 0) return null;

  const panes: Record<string, TerminalPaneProps> = {};
  const paneIds: string[] = [];

  for (const win of windows) {
    const id = uuidv4();
    paneIds.push(id);
    panes[id] = createTerminalPane(workspaceId, win.name, {
      id,
      tmuxWindowName: win.name,
      isNewPane: false,
    });
  }

  let layout: MosaicNode<string> = paneIds[0];
  for (let index = 1; index < paneIds.length; index++) {
    layout = {
      direction: "row",
      first: layout,
      second: paneIds[index],
      splitPercentage: Math.round((100 * index) / (index + 1)),
    };
  }

  return { panes, layout };
}

export function evictTerminalWorkspaceRuntimeState(
  state: TerminalRuntimeEvictState,
  workspaceId: string,
): Omit<TerminalRuntimeEvictState, "persistedTerminalLayouts"> & {
  persistedTerminalLayouts: Record<string, PersistedTerminalWorkspaceLayoutDocument | null>;
} {
  const nextWorkspaceTerminalTabs = { ...state.workspaceTerminalTabs };
  const nextWorkspaceActiveTerminalTabIds = { ...state.workspaceActiveTerminalTabIds };
  const nextWorkspacePanes = { ...state.workspacePanes };
  const nextWorkspaceLayouts = { ...state.workspaceLayouts };
  const nextWorkspaceMaximizedIds = { ...state.workspaceMaximizedIds };
  const nextSaveTimeouts = { ...state.saveTimeouts };
  const nextTmuxWindowsCache = { ...state.tmuxWindowsCache };
  const nextPersistedTerminalLayouts = { ...state.persistedTerminalLayouts };
  const nextWorkspaceContexts = { ...state.workspaceContexts };
  const nextProjectWikiPanes = { ...state.projectWikiPanes };
  const nextProjectWikiLayouts = { ...state.projectWikiLayouts };
  const nextProjectWikiMaximizedIds = { ...state.projectWikiMaximizedIds };
  const nextCodeReviewPanes = { ...state.codeReviewPanes };
  const nextCodeReviewLayouts = { ...state.codeReviewLayouts };
  const nextCodeReviewMaximizedIds = { ...state.codeReviewMaximizedIds };
  const nextLoadedWorkspaces = new Set(state.loadedWorkspaces);
  const nextHydratedTerminalScopes = new Set(state.hydratedTerminalScopes);
  const nextInitializingWorkspaces = new Set(state.initializingWorkspaces);
  const nextInitializingTerminalScopes = new Set(state.initializingTerminalScopes);
  const nextProjectWikiLoadedWorkspaces = new Set(state.projectWikiLoadedWorkspaces);
  const nextProjectWikiInitializingWorkspaces = new Set(state.projectWikiInitializingWorkspaces);
  const nextCodeReviewLoadedWorkspaces = new Set(state.codeReviewLoadedWorkspaces);
  const nextCodeReviewInitializingWorkspaces = new Set(state.codeReviewInitializingWorkspaces);

  delete nextWorkspaceTerminalTabs[workspaceId];
  delete nextWorkspaceActiveTerminalTabIds[workspaceId];
  delete nextSaveTimeouts[workspaceId];
  delete nextTmuxWindowsCache[workspaceId];
  delete nextPersistedTerminalLayouts[workspaceId];
  delete nextWorkspaceContexts[workspaceId];
  delete nextProjectWikiPanes[workspaceId];
  delete nextProjectWikiLayouts[workspaceId];
  delete nextProjectWikiMaximizedIds[workspaceId];
  delete nextCodeReviewPanes[workspaceId];
  delete nextCodeReviewLayouts[workspaceId];
  delete nextCodeReviewMaximizedIds[workspaceId];

  for (const key of Object.keys(nextWorkspacePanes)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      delete nextWorkspacePanes[key];
    }
  }
  for (const key of Object.keys(nextWorkspaceLayouts)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      delete nextWorkspaceLayouts[key];
    }
  }
  for (const key of Object.keys(nextWorkspaceMaximizedIds)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      delete nextWorkspaceMaximizedIds[key];
    }
  }

  nextLoadedWorkspaces.delete(workspaceId);
  nextInitializingWorkspaces.delete(workspaceId);
  nextProjectWikiLoadedWorkspaces.delete(workspaceId);
  nextProjectWikiInitializingWorkspaces.delete(workspaceId);
  nextCodeReviewLoadedWorkspaces.delete(workspaceId);
  nextCodeReviewInitializingWorkspaces.delete(workspaceId);

  for (const key of Array.from(nextHydratedTerminalScopes)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      nextHydratedTerminalScopes.delete(key);
    }
  }
  for (const key of Array.from(nextInitializingTerminalScopes)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      nextInitializingTerminalScopes.delete(key);
    }
  }

  return {
    workspaceTerminalTabs: nextWorkspaceTerminalTabs,
    workspaceActiveTerminalTabIds: nextWorkspaceActiveTerminalTabIds,
    workspacePanes: nextWorkspacePanes,
    workspaceLayouts: nextWorkspaceLayouts,
    workspaceMaximizedIds: nextWorkspaceMaximizedIds,
    loadedWorkspaces: nextLoadedWorkspaces,
    hydratedTerminalScopes: nextHydratedTerminalScopes,
    initializingWorkspaces: nextInitializingWorkspaces,
    initializingTerminalScopes: nextInitializingTerminalScopes,
    saveTimeouts: nextSaveTimeouts,
    isHydrated: state.isHydrated,
    tmuxWindowsCache: nextTmuxWindowsCache,
    persistedTerminalLayouts: nextPersistedTerminalLayouts,
    workspaceContexts: nextWorkspaceContexts,
    projectWikiPanes: nextProjectWikiPanes,
    projectWikiLayouts: nextProjectWikiLayouts,
    projectWikiMaximizedIds: nextProjectWikiMaximizedIds,
    projectWikiLoadedWorkspaces: nextProjectWikiLoadedWorkspaces,
    projectWikiInitializingWorkspaces: nextProjectWikiInitializingWorkspaces,
    codeReviewPanes: nextCodeReviewPanes,
    codeReviewLayouts: nextCodeReviewLayouts,
    codeReviewMaximizedIds: nextCodeReviewMaximizedIds,
    codeReviewLoadedWorkspaces: nextCodeReviewLoadedWorkspaces,
    codeReviewInitializingWorkspaces: nextCodeReviewInitializingWorkspaces,
  };
}

export function buildPersistedTerminalWorkspaceLayout(
  state: TerminalPersistenceState,
  workspaceId: string,
): PersistedTerminalWorkspaceLayoutDocument | null {
  const tabs = getWorkspaceTerminalTabs(state, workspaceId);
  const persistedCache = state.persistedTerminalLayouts[workspaceId];
  const persistedTabs: PersistedTerminalTabDocument[] = [];

  for (const tab of tabs) {
    const scopeKey = getScopeKey(workspaceId, tab.id);
    const panes = state.workspacePanes[scopeKey];
    const layout = state.workspaceLayouts[scopeKey];
    if (!panes || !layout) {
      const cachedTab = persistedCache?.tabs.find((persistedTab) => persistedTab.id === tab.id);
      if (cachedTab) {
        persistedTabs.push({
          ...cachedTab,
          title: tab.id === FIXED_TERMINAL_TAB_VALUE ? "Term" : tab.title,
          closable: tab.id !== FIXED_TERMINAL_TAB_VALUE,
        });
      }
      continue;
    }

    const cleanPanes: Record<string, PersistedTerminalPane> = {};
    for (const [id, pane] of Object.entries(panes)) {
      cleanPanes[id] = {
        id: pane.id,
        label: pane.label,
        workspaceId: pane.workspaceId,
        tmuxWindowName: pane.tmuxWindowName,
        agent: pane.agent,
        projectName: pane.projectName,
        workspaceName: pane.workspaceName,
        isNewPane: pane.isNewPane,
      };
    }

    persistedTabs.push({
      id: tab.id,
      title: tab.id === FIXED_TERMINAL_TAB_VALUE ? "Term" : tab.title,
      closable: tab.id !== FIXED_TERMINAL_TAB_VALUE,
      layout,
      panes: cleanPanes,
      maximizedTerminalId: state.workspaceMaximizedIds[scopeKey] || null,
    });
  }

  if (persistedTabs.length === 0) {
    return null;
  }

  return {
    schema: TERMINAL_LAYOUT_SCHEMA,
    activeTabId:
      persistedTabs.some((tab) => tab.id === (state.workspaceActiveTerminalTabIds[workspaceId] || FIXED_TERMINAL_TAB_VALUE))
        ? state.workspaceActiveTerminalTabIds[workspaceId] || FIXED_TERMINAL_TAB_VALUE
        : persistedTabs[0]?.id || FIXED_TERMINAL_TAB_VALUE,
    tabs: persistedTabs,
  };
}

export function removePaneFromLayout(
  node: MosaicNode<string> | null,
  targetId: string,
): MosaicNode<string> | null {
  if (!node) return null;
  if (typeof node === "string") {
    return node === targetId ? null : node;
  }

  const first = removePaneFromLayout(node.first, targetId);
  const second = removePaneFromLayout(node.second, targetId);

  if (!first) return second;
  if (!second) return first;

  return { ...node, first, second };
}

export function splitPaneInLayout(
  node: MosaicNode<string>,
  targetId: string,
  newId: string,
  direction: MosaicDirection,
): MosaicNode<string> {
  if (typeof node === "string") {
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
    first: splitPaneInLayout(node.first, targetId, newId, direction),
    second: splitPaneInLayout(node.second, targetId, newId, direction),
  };
}
