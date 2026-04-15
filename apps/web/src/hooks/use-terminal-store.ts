"use client";

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { MosaicNode, MosaicDirection, getLeaves } from "react-mosaic-component";
import { workspaceLayoutApi, projectLayoutApi, systemApi, TmuxWindow } from "@/api/rest-api";
import type { TerminalPaneAgent, TerminalPaneProps } from "@/components/terminal/types";

const SAVE_DEBOUNCE_MS = 500;
export const FIXED_TERMINAL_TAB_VALUE = "terminal";
export const TERMINAL_TAB_VALUE_PREFIX = "terminal-tab:";
const TERMINAL_LAYOUT_SCHEMA = "terminal-layout.v1";

export interface TerminalCenterTab {
  id: string;
  title: string;
  closable: boolean;
}

interface PersistedTerminalTab {
  id: string;
  title: string;
  closable: boolean;
  layout: MosaicNode<string> | null;
  maximizedTerminalId?: string | null;
  panes: Record<string, Omit<TerminalPaneProps, "sessionId" | "dynamicTitle">>;
}

interface PersistedTerminalWorkspaceLayout {
  schema: typeof TERMINAL_LAYOUT_SCHEMA;
  activeTabId?: string | null;
  tabs: PersistedTerminalTab[];
}

interface LegacyPersistedTerminalTabState {
  panes: Record<string, Omit<TerminalPaneProps, "sessionId" | "dynamicTitle">>;
  layout: MosaicNode<string> | null;
  maximizedTerminalId?: string | null;
}

interface LegacyPersistedTerminalWorkspaceLayout {
  version: 2;
  tabs: TerminalCenterTab[];
  activeTabId?: string | null;
  tabStates: Record<string, LegacyPersistedTerminalTabState>;
}

interface TerminalStore {
  workspaceTerminalTabs: Record<string, TerminalCenterTab[]>;
  workspaceActiveTerminalTabIds: Record<string, string>;
  workspacePanes: Record<string, Record<string, TerminalPaneProps>>;
  workspaceLayouts: Record<string, MosaicNode<string> | null>;
  workspaceMaximizedIds: Record<string, string | null>;
  /** Track which workspaces have terminal metadata loaded from backend */
  loadedWorkspaces: Set<string>;
  /** Track which terminal scopes (workspace + tab) have pane/layout state hydrated */
  hydratedTerminalScopes: Set<string>;
  /** Track which workspaces are currently being initialized (loading from backend) */
  initializingWorkspaces: Set<string>;
  /** Track which specific terminal scopes are currently being hydrated */
  initializingTerminalScopes: Set<string>;
  /** Track pending save operations */
  saveTimeouts: Record<string, NodeJS.Timeout>;
  /** Track if store is hydrated (client-side only) */
  isHydrated: boolean;
  /** Cache of existing tmux windows per workspace */
  tmuxWindowsCache: Record<string, TmuxWindow[]>;
  /** Canonical persisted terminal layout document cache by workspace/project context */
  persistedTerminalLayouts: Record<string, PersistedTerminalWorkspaceLayout | null>;
  /** Track whether each workspaceId is actually a project context (used for API selection) */
  workspaceContexts: Record<string, boolean>;

  /** Project Wiki tab: separate panes/layout, does not affect main Terminal (Code workspace) */
  projectWikiPanes: Record<string, Record<string, TerminalPaneProps>>;
  projectWikiLayouts: Record<string, MosaicNode<string> | null>;
  projectWikiMaximizedIds: Record<string, string | null>;
  projectWikiLoadedWorkspaces: Set<string>;
  projectWikiInitializingWorkspaces: Set<string>;
  
  // Actions
  getTerminalTabs: (workspaceId: string) => TerminalCenterTab[];
  getActiveTerminalTabId: (workspaceId: string) => string;
  setActiveTerminalTab: (workspaceId: string, terminalTabId: string) => void;
  createTerminalTab: (workspaceId: string) => TerminalCenterTab;
  closeTerminalTab: (workspaceId: string, terminalTabId: string) => void;
  getPanes: (workspaceId: string, terminalTabId?: string) => Record<string, TerminalPaneProps>;
  getLayout: (workspaceId: string, terminalTabId?: string) => MosaicNode<string> | null;
  getPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string, terminalTabId?: string) => string | null;
  getMaximizedTerminalId: (workspaceId: string, terminalTabId?: string) => string | null;
  /** Check if workspace has been fully loaded and is ready for rendering */
  isWorkspaceReady: (workspaceId: string, terminalTabId?: string) => boolean;
  setLayout: (workspaceId: string, layout: MosaicNode<string> | null, terminalTabId?: string) => void;
  addTerminal: (workspaceId: string, label?: string, terminalTabId?: string, agent?: TerminalPaneAgent) => string;
  removeTerminal: (workspaceId: string, id: string, terminalTabId?: string) => void;
  splitTerminal: (workspaceId: string, id: string, direction: MosaicDirection, terminalTabId?: string, agent?: TerminalPaneAgent) => string | null;
  toggleMaximize: (workspaceId: string, id: string, terminalTabId?: string) => void;
  
  // Initialization
  primeWorkspace: (workspaceId: string, isProjectContext?: boolean) => void;
  initWorkspace: (workspaceId: string, isProjectContext?: boolean, terminalTabId?: string) => void;
  evictWorkspaceRuntime: (workspaceId: string) => void;

  // Backend sync
  loadFromBackend: (workspaceId: string, isProjectContext?: boolean, terminalTabId?: string | null) => Promise<void>;
  saveToBackend: (workspaceId: string, isProjectContext?: boolean) => void;
  fetchTmuxWindows: (workspaceId: string) => Promise<TmuxWindow[]>;
  
  // Tmux window tracking
  setTmuxWindowName: (workspaceId: string, paneId: string, tmuxWindowName: string, terminalTabId?: string) => void;
  
  // Dynamic title (from shell shim OSC sequences)
  setDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string, terminalTabId?: string) => void;
  setPaneAgent: (workspaceId: string, paneId: string, agent: TerminalPaneAgent, terminalTabId?: string) => void;

  // Project Wiki scope (separate from main Terminal)
  getProjectWikiPanes: (workspaceId: string) => Record<string, TerminalPaneProps>;
  getProjectWikiLayout: (workspaceId: string) => MosaicNode<string> | null;
  isProjectWikiReady: (workspaceId: string) => boolean;
  setProjectWikiLayout: (workspaceId: string, layout: MosaicNode<string> | null) => void;
  addProjectWikiTerminal: (workspaceId: string, label?: string, agent?: TerminalPaneAgent) => string;
  removeProjectWikiTerminal: (workspaceId: string, id: string) => void;
  splitProjectWikiTerminal: (workspaceId: string, id: string, direction: MosaicDirection, agent?: TerminalPaneAgent) => string | null;
  initProjectWikiWorkspace: (workspaceId: string) => void;
  loadProjectWikiFromTmux: (workspaceId: string) => Promise<void>;
  getProjectWikiPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string) => string | null;
  setProjectWikiDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string) => void;
  setProjectWikiPaneAgent: (workspaceId: string, paneId: string, agent: TerminalPaneAgent) => void;
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
  addCodeReviewTerminal: (workspaceId: string, label?: string, agent?: TerminalPaneAgent) => string;
  removeCodeReviewTerminal: (workspaceId: string, id: string) => void;
  initCodeReviewWorkspace: (workspaceId: string) => void;
  loadCodeReviewFromTmux: (workspaceId: string) => Promise<void>;
  getCodeReviewPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string) => string | null;
  setCodeReviewDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string) => void;
  setCodeReviewPaneAgent: (workspaceId: string, paneId: string, agent: TerminalPaneAgent) => void;
  toggleCodeReviewMaximize: (workspaceId: string, id: string) => void;
  splitCodeReviewTerminal: (workspaceId: string, id: string, direction: MosaicDirection, agent?: TerminalPaneAgent) => string | null;
}

/** Generate next available window name (1, 2, 3, ...) for numeric names */
function getNextWindowName(existingPanes: Record<string, TerminalPaneProps>): string {
  const values = Object.values(existingPanes);
  const usedNames = new Set([
    ...values.map(p => p.tmuxWindowName),
    ...values.map(p => p.label),
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
    ...values.map(p => p.label),
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

function createFixedTerminalTab(): TerminalCenterTab {
  return {
    id: FIXED_TERMINAL_TAB_VALUE,
    title: "Term",
    closable: false,
  };
}

function createTerminalPane(
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

function samePaneAgent(left: TerminalPaneAgent | undefined, right: TerminalPaneAgent): boolean {
  return (
    left?.id === right.id &&
    left?.label === right.label &&
    left?.command === right.command &&
    left?.iconType === right.iconType
  );
}

function getScopeKey(workspaceId: string, terminalTabId: string = FIXED_TERMINAL_TAB_VALUE): string {
  return terminalTabId === FIXED_TERMINAL_TAB_VALUE
    ? workspaceId
    : `${workspaceId}::${terminalTabId}`;
}

function getWorkspaceTerminalTabs(state: Pick<TerminalStore, "workspaceTerminalTabs">, workspaceId: string): TerminalCenterTab[] {
  return state.workspaceTerminalTabs[workspaceId] || [createFixedTerminalTab()];
}

function getAllDefaultPanesForWorkspace(
  state: Pick<TerminalStore, "workspaceTerminalTabs" | "workspacePanes" | "persistedTerminalLayouts">,
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

function getNextTerminalTabTitle(existingTabs: TerminalCenterTab[]): string {
  const usedTitles = new Set(existingTabs.map((tab) => tab.title));
  let index = 1;
  while (usedTitles.has(`Term - ${index}`)) {
    index++;
  }
  return `Term - ${index}`;
}

function isPersistedTerminalWorkspaceLayout(value: unknown): value is PersistedTerminalWorkspaceLayout {
  return (
    !!value &&
    typeof value === "object" &&
    (value as PersistedTerminalWorkspaceLayout).schema === TERMINAL_LAYOUT_SCHEMA &&
    Array.isArray((value as PersistedTerminalWorkspaceLayout).tabs)
  );
}

function isLegacyPersistedTerminalWorkspaceLayout(value: unknown): value is LegacyPersistedTerminalWorkspaceLayout {
  return !!value && typeof value === "object" && (value as LegacyPersistedTerminalWorkspaceLayout).version === 2;
}

function normalizePersistedTerminalTabs(tabs: PersistedTerminalTab[] | TerminalCenterTab[]): PersistedTerminalTab[] {
  return tabs.map((tab) => ({
    ...tab,
    title: tab.id === FIXED_TERMINAL_TAB_VALUE ? "Term" : tab.title,
    closable: tab.id !== FIXED_TERMINAL_TAB_VALUE,
    panes: "panes" in tab ? tab.panes : {},
    layout: "layout" in tab ? tab.layout : null,
    maximizedTerminalId: "maximizedTerminalId" in tab ? tab.maximizedTerminalId ?? null : null,
  }));
}

function migrateTerminalLayoutDocument(
  value: unknown,
): { layout: PersistedTerminalWorkspaceLayout; migrated: boolean } | null {
  if (isPersistedTerminalWorkspaceLayout(value)) {
    return {
      layout: {
        schema: TERMINAL_LAYOUT_SCHEMA,
        activeTabId: value.activeTabId ?? null,
        tabs: normalizePersistedTerminalTabs(value.tabs),
      },
      migrated: false,
    };
  }

  if (isLegacyPersistedTerminalWorkspaceLayout(value)) {
    const tabs = normalizePersistedTerminalTabs(value.tabs).map((tab) => {
      const tabState = value.tabStates[tab.id];
      return {
        ...tab,
        panes: tabState?.panes ?? {},
        layout: tabState?.layout ?? null,
        maximizedTerminalId: tabState?.maximizedTerminalId ?? null,
      };
    });

    return {
      layout: {
        schema: TERMINAL_LAYOUT_SCHEMA,
        activeTabId: value.activeTabId ?? null,
        tabs,
      },
      migrated: true,
    };
  }

  const legacyValue = value as {
    panes?: Record<string, TerminalPaneProps>;
    layout?: MosaicNode<string> | null;
  } | null;

  if (legacyValue?.panes && legacyValue.layout) {
    return {
      layout: {
        schema: TERMINAL_LAYOUT_SCHEMA,
        activeTabId: FIXED_TERMINAL_TAB_VALUE,
        tabs: [
          {
            id: FIXED_TERMINAL_TAB_VALUE,
            title: "Term",
            closable: false,
            panes: legacyValue.panes,
            layout: legacyValue.layout,
            maximizedTerminalId: null,
          },
        ],
      },
      migrated: true,
    };
  }

  return null;
}

function hydratePersistedTab(
  workspaceId: string,
  tab: PersistedTerminalTab,
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

function createInitialLayout(
  workspaceId: string,
  existingPanes: Record<string, TerminalPaneProps> = {},
): {
  panes: Record<string, TerminalPaneProps>, 
  layout: MosaicNode<string> 
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

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  workspaceTerminalTabs: {},
  workspaceActiveTerminalTabIds: {},
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
    return state.workspaceActiveTerminalTabIds[workspaceId] || FIXED_TERMINAL_TAB_VALUE;
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

  createTerminalTab: (workspaceId) => {
    const state = get();
    const existingTabs = getWorkspaceTerminalTabs(state, workspaceId);
    const newTab: TerminalCenterTab = {
      id: `${TERMINAL_TAB_VALUE_PREFIX}${uuidv4()}`,
      title: getNextTerminalTabTitle(existingTabs),
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

  closeTerminalTab: (workspaceId, terminalTabId) => {
    if (terminalTabId === FIXED_TERMINAL_TAB_VALUE) return;

    const scopeKey = getScopeKey(workspaceId, terminalTabId);
    set((state) => {
      const nextTabs = getWorkspaceTerminalTabs(state, workspaceId).filter((tab) => tab.id !== terminalTabId);
      const restPanes = { ...state.workspacePanes };
      const restLayouts = { ...state.workspaceLayouts };
      const restMaximized = { ...state.workspaceMaximizedIds };
      const nextHydratedScopes = new Set(state.hydratedTerminalScopes);
      const nextInitializingScopes = new Set(state.initializingTerminalScopes);
      delete restPanes[scopeKey];
      delete restLayouts[scopeKey];
      delete restMaximized[scopeKey];
      nextHydratedScopes.delete(scopeKey);
      nextInitializingScopes.delete(scopeKey);

      return {
        workspaceTerminalTabs: {
          ...state.workspaceTerminalTabs,
          [workspaceId]: nextTabs.length > 0 ? nextTabs : [createFixedTerminalTab()],
        },
        workspaceActiveTerminalTabIds: {
          ...state.workspaceActiveTerminalTabIds,
          [workspaceId]:
            state.workspaceActiveTerminalTabIds[workspaceId] === terminalTabId
              ? FIXED_TERMINAL_TAB_VALUE
              : state.workspaceActiveTerminalTabIds[workspaceId] || FIXED_TERMINAL_TAB_VALUE,
        },
        workspacePanes: restPanes,
        workspaceLayouts: restLayouts,
        workspaceMaximizedIds: restMaximized,
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
    return (
      state.loadedWorkspaces.has(workspaceId) &&
      state.hydratedTerminalScopes.has(scopeKey) &&
      !state.initializingWorkspaces.has(workspaceId) &&
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
    const state = get();

    if (state.workspaceContexts[workspaceId] !== isProjectContext) {
      set((state) => ({
        workspaceContexts: { ...state.workspaceContexts, [workspaceId]: isProjectContext },
      }));
    }

    if (state.loadedWorkspaces.has(workspaceId)) {
      return;
    }

    if (state.initializingWorkspaces.has(workspaceId)) {
      return;
    }

    set((state) => ({
      initializingWorkspaces: new Set([...state.initializingWorkspaces, workspaceId]),
    }));

    void get().loadFromBackend(workspaceId, isProjectContext, null);
  },

  initWorkspace: (workspaceId, isProjectContext = false, terminalTabId = FIXED_TERMINAL_TAB_VALUE) => {
    const state = get();
    const scopeKey = getScopeKey(workspaceId, terminalTabId);

    if (state.workspaceContexts[workspaceId] !== isProjectContext) {
      set((currentState) => ({
        workspaceContexts: { ...currentState.workspaceContexts, [workspaceId]: isProjectContext },
      }));
    }

    if (state.hydratedTerminalScopes.has(scopeKey) || state.initializingTerminalScopes.has(scopeKey)) {
      return;
    }

    if (!state.loadedWorkspaces.has(workspaceId) && !state.initializingWorkspaces.has(workspaceId)) {
      set((currentState) => ({
        initializingWorkspaces: new Set([...currentState.initializingWorkspaces, workspaceId]),
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
    const state = get();
    const timeout = state.saveTimeouts[workspaceId];
    if (timeout) {
      clearTimeout(timeout);
    }

    set((currentState) => {
      const nextWorkspaceTerminalTabs = { ...currentState.workspaceTerminalTabs };
      const nextWorkspaceActiveTerminalTabIds = { ...currentState.workspaceActiveTerminalTabIds };
      const nextWorkspacePanes = { ...currentState.workspacePanes };
      const nextWorkspaceLayouts = { ...currentState.workspaceLayouts };
      const nextWorkspaceMaximizedIds = { ...currentState.workspaceMaximizedIds };
      const nextSaveTimeouts = { ...currentState.saveTimeouts };
      const nextTmuxWindowsCache = { ...currentState.tmuxWindowsCache };
      const nextPersistedTerminalLayouts = { ...currentState.persistedTerminalLayouts };
      const nextWorkspaceContexts = { ...currentState.workspaceContexts };
      const nextProjectWikiPanes = { ...currentState.projectWikiPanes };
      const nextProjectWikiLayouts = { ...currentState.projectWikiLayouts };
      const nextProjectWikiMaximizedIds = { ...currentState.projectWikiMaximizedIds };
      const nextCodeReviewPanes = { ...currentState.codeReviewPanes };
      const nextCodeReviewLayouts = { ...currentState.codeReviewLayouts };
      const nextCodeReviewMaximizedIds = { ...currentState.codeReviewMaximizedIds };
      const nextLoadedWorkspaces = new Set(currentState.loadedWorkspaces);
      const nextHydratedTerminalScopes = new Set(currentState.hydratedTerminalScopes);
      const nextInitializingWorkspaces = new Set(currentState.initializingWorkspaces);
      const nextInitializingTerminalScopes = new Set(currentState.initializingTerminalScopes);
      const nextProjectWikiLoadedWorkspaces = new Set(currentState.projectWikiLoadedWorkspaces);
      const nextProjectWikiInitializingWorkspaces = new Set(currentState.projectWikiInitializingWorkspaces);
      const nextCodeReviewLoadedWorkspaces = new Set(currentState.codeReviewLoadedWorkspaces);
      const nextCodeReviewInitializingWorkspaces = new Set(currentState.codeReviewInitializingWorkspaces);

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
    });
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

  loadFromBackend: async (workspaceId, isProjectContext = false, terminalTabId = null) => {
    if (typeof window === "undefined") return;

    const targetTabId = terminalTabId ?? null;
    const targetScopeKey = targetTabId ? getScopeKey(workspaceId, targetTabId) : null;
    const layoutApi = isProjectContext ? projectLayoutApi : workspaceLayoutApi;

    const clearWorkspaceInitializing = () => {
      set((state) => ({
        initializingWorkspaces: new Set(
          [...state.initializingWorkspaces].filter((id) => id !== workspaceId),
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

      let persistedLayout = state.persistedTerminalLayouts[workspaceId] ?? null;
      let existingWindows = state.tmuxWindowsCache[workspaceId] ?? [];
      let loadedMetadataThisCall = false;

      if (!state.loadedWorkspaces.has(workspaceId)) {
        const [layoutResult, fetchedWindows] = await Promise.all([
          layoutApi.getLayout(workspaceId).catch(() => null),
          get().fetchTmuxWindows(workspaceId),
        ]);

        existingWindows = fetchedWindows;

        if (layoutResult?.layout) {
          const parsed = JSON.parse(layoutResult.layout) as unknown;
          const migrated = migrateTerminalLayoutDocument(parsed);
          if (migrated) {
            persistedLayout = migrated.layout;
            const availableTabs = migrated.layout.tabs.map((tab) => ({
              id: tab.id,
              title: tab.id === FIXED_TERMINAL_TAB_VALUE ? "Term" : tab.title,
              closable: tab.id !== FIXED_TERMINAL_TAB_VALUE,
            }));
            const activeTabId =
              migrated.layout.activeTabId && availableTabs.some((tab) => tab.id === migrated.layout.activeTabId)
                ? migrated.layout.activeTabId
                : availableTabs[0]?.id || FIXED_TERMINAL_TAB_VALUE;

            set((currentState) => ({
              workspaceTerminalTabs: {
                ...currentState.workspaceTerminalTabs,
                [workspaceId]: availableTabs.length > 0 ? availableTabs : [createFixedTerminalTab()],
              },
              workspaceActiveTerminalTabIds: {
                ...currentState.workspaceActiveTerminalTabIds,
                [workspaceId]: activeTabId,
              },
              persistedTerminalLayouts: {
                ...currentState.persistedTerminalLayouts,
                [workspaceId]: migrated.layout,
              },
              loadedWorkspaces: new Set([...currentState.loadedWorkspaces, workspaceId]),
              initializingWorkspaces: new Set(
                [...currentState.initializingWorkspaces].filter((id) => id !== workspaceId),
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
              [workspaceId]: null,
            },
            loadedWorkspaces: new Set([...currentState.loadedWorkspaces, workspaceId]),
            initializingWorkspaces: new Set(
              [...currentState.initializingWorkspaces].filter((id) => id !== workspaceId),
            ),
            isHydrated: true,
          }));
          loadedMetadataThisCall = true;
        }
      } else if (existingWindows.length === 0) {
        existingWindows = await get().fetchTmuxWindows(workspaceId);
      }

      state = get();
      persistedLayout = state.persistedTerminalLayouts[workspaceId] ?? persistedLayout;

      if (loadedMetadataThisCall && persistedLayout?.tabs.length) {
        setTimeout(() => {
          const currentState = get();
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
        const hydratedTab = persistedTab
          ? hydratePersistedTab(workspaceId, persistedTab, existingWindowNames)
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
        const panes: Record<string, TerminalPaneProps> = {};
        const paneIds: string[] = [];

        for (const win of existingWindows) {
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

        set((currentState) => ({
          workspacePanes: {
            ...currentState.workspacePanes,
            [targetScopeKey!]: panes,
          },
          workspaceLayouts: {
            ...currentState.workspaceLayouts,
            [targetScopeKey!]: layout,
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

  saveToBackend: (workspaceId) => {
    if (typeof window === 'undefined') return;

    const state = get();
    if (!state.loadedWorkspaces.has(workspaceId) || state.initializingWorkspaces.has(workspaceId)) {
      return;
    }
    if (state.saveTimeouts[workspaceId]) {
      clearTimeout(state.saveTimeouts[workspaceId]);
    }

    const timeout = setTimeout(async () => {
      const currentState = get();
      const isProjectContext = currentState.workspaceContexts[workspaceId] || false;

      try {
        const tabs = getWorkspaceTerminalTabs(currentState, workspaceId);
        const persistedCache = currentState.persistedTerminalLayouts[workspaceId];
        const persistedTabs: PersistedTerminalTab[] = [];

        for (const tab of tabs) {
          const scopeKey = getScopeKey(workspaceId, tab.id);
          const panes = currentState.workspacePanes[scopeKey];
          const layout = currentState.workspaceLayouts[scopeKey];
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

          const cleanPanes: Record<string, Omit<TerminalPaneProps, "sessionId" | "dynamicTitle">> = {};
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
            maximizedTerminalId: currentState.workspaceMaximizedIds[scopeKey] || null,
          });
        }

        const layoutApi = isProjectContext ? projectLayoutApi : workspaceLayoutApi;
        const payload: PersistedTerminalWorkspaceLayout = {
          schema: TERMINAL_LAYOUT_SCHEMA,
          activeTabId:
            persistedTabs.some((tab) => tab.id === (currentState.workspaceActiveTerminalTabIds[workspaceId] || FIXED_TERMINAL_TAB_VALUE))
              ? currentState.workspaceActiveTerminalTabIds[workspaceId] || FIXED_TERMINAL_TAB_VALUE
              : persistedTabs[0]?.id || FIXED_TERMINAL_TAB_VALUE,
          tabs: persistedTabs,
        };

        // Never overwrite a persisted workspace/project layout with an empty shell.
        // This can happen during early mount when tab UI state is ready before the
        // actual pane/layout state has hydrated from backend.
        if (persistedTabs.length === 0) {
          console.debug('Skipping terminal layout save because no valid tab states are available yet');
          return;
        }

        set((state) => ({
          persistedTerminalLayouts: {
            ...state.persistedTerminalLayouts,
            [workspaceId]: payload,
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
        [workspaceId]: timeout,
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
    return newId;
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
    return newId;
  },
}));
