"use client";

import type { TerminalLayoutDirection, TerminalLayoutNode } from "@/features/terminal/types/index";
import type { TerminalContextScope, TmuxWindow } from "@/api/rest-api";
import type {
  TerminalPaneAgent,
  TerminalPaneProps,
} from "@/features/terminal/types/index";
import type { PersistedTerminalWorkspaceLayoutDocument } from "@/features/terminal/lib/terminal-layout-document";
import type { TerminalCenterTab } from "@/features/terminal/store/terminal-store-helpers";

export interface CreateTerminalTabOptions {
  title?: string;
}

export interface CreateTerminalTabWithInitialPaneOptions extends CreateTerminalTabOptions {
  paneAgent?: TerminalPaneAgent;
  paneLabel?: string;
}

export interface TerminalStore {
  workspaceTerminalTabs: Record<string, TerminalCenterTab[]>;
  workspaceActiveTerminalTabIds: Record<string, string>;
  /**
   * Last focused pane id per tab scope (`getScopeKey(workspaceId, tabId)`).
   * Ephemeral (not persisted) — drives multi-pane auto tab titles.
   */
  workspaceActivePaneIds: Record<string, string | null>;
  workspacePanes: Record<string, Record<string, TerminalPaneProps>>;
  workspaceLayouts: Record<string, TerminalLayoutNode<string> | null>;
  workspaceMaximizedIds: Record<string, string | null>;
  loadedWorkspaces: Set<string>;
  hydratedTerminalScopes: Set<string>;
  initializingWorkspaces: Set<string>;
  initializingTerminalScopes: Set<string>;
  saveTimeouts: Record<string, NodeJS.Timeout>;
  isHydrated: boolean;
  tmuxWindowsCache: Record<string, TmuxWindow[]>;
  persistedTerminalLayouts: Record<string, PersistedTerminalWorkspaceLayoutDocument | null>;
  workspaceContexts: Record<string, boolean>;

  projectWikiPanes: Record<string, Record<string, TerminalPaneProps>>;
  projectWikiLayouts: Record<string, TerminalLayoutNode<string> | null>;
  projectWikiMaximizedIds: Record<string, string | null>;
  projectWikiLoadedWorkspaces: Set<string>;
  projectWikiInitializingWorkspaces: Set<string>;

  getTerminalTabs: (workspaceId: string) => TerminalCenterTab[];
  getActiveTerminalTabId: (workspaceId: string) => string;
  setActiveTerminalTab: (workspaceId: string, terminalTabId: string) => void;
  createTerminalTab: (workspaceId: string, options?: CreateTerminalTabOptions) => TerminalCenterTab;
  createTerminalTabWithInitialPane: (workspaceId: string, contextScope?: TerminalContextScope, options?: CreateTerminalTabWithInitialPaneOptions) => Promise<{
    tab: TerminalCenterTab;
    paneId: string;
    pane: TerminalPaneProps;
  } | null>;
  closeTerminalTab: (workspaceId: string, terminalTabId: string) => void;
  getPanes: (workspaceId: string, terminalTabId?: string) => Record<string, TerminalPaneProps>;
  getLayout: (workspaceId: string, terminalTabId?: string) => TerminalLayoutNode<string> | null;
  getPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string, terminalTabId?: string) => string | null;
  getMaximizedTerminalId: (workspaceId: string, terminalTabId?: string) => string | null;
  isWorkspaceReady: (workspaceId: string, terminalTabId?: string) => boolean;
  setLayout: (workspaceId: string, layout: TerminalLayoutNode<string> | null, terminalTabId?: string) => void;
  addTerminal: (workspaceId: string, label?: string, terminalTabId?: string, agent?: TerminalPaneAgent) => string;
  removeTerminal: (workspaceId: string, id: string, terminalTabId?: string) => void;
  splitTerminal: (workspaceId: string, id: string, direction: TerminalLayoutDirection, terminalTabId?: string, agent?: TerminalPaneAgent) => string | null;
  toggleMaximize: (workspaceId: string, id: string, terminalTabId?: string) => void;
  /** Record the last focused pane for a terminal tab (display-only / title source). */
  setActivePaneId: (workspaceId: string, paneId: string | null, terminalTabId?: string) => void;

  primeWorkspace: (workspaceId: string, isProjectContext?: boolean) => void;
  initWorkspace: (workspaceId: string, isProjectContext?: boolean, terminalTabId?: string) => void;
  /** Full wipe of terminal identity + live state (computer switch / delete). */
  evictWorkspaceRuntime: (workspaceId: string) => void;
  /** APP-043 freeze: drop live attach/hydration only; keep tab/layout identity. */
  detachWorkspaceFrontend: (workspaceId: string) => void;

  loadFromBackend: (workspaceId: string, isProjectContext?: boolean, terminalTabId?: string | null) => Promise<void>;
  saveToBackend: (workspaceId: string, isProjectContext?: boolean) => void;
  fetchTmuxWindows: (workspaceId: string, isProjectContext?: boolean) => Promise<TmuxWindow[]>;

  setTmuxWindowName: (workspaceId: string, paneId: string, tmuxWindowName: string, terminalTabId?: string) => void;
  markPaneAttached: (workspaceId: string, paneId: string, terminalTabId?: string) => void;
  setDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string, terminalTabId?: string) => void;
  /** Set/clear native OSC 0/2 title (display-only; `undefined` or empty clears). */
  setOscTitle: (workspaceId: string, paneId: string, oscTitle: string | undefined, terminalTabId?: string) => void;
  setPaneAgent: (workspaceId: string, paneId: string, agent: TerminalPaneAgent, terminalTabId?: string) => void;

  /** Set/clear a tab's custom display title. Empty (after normalize) clears the override. */
  setTabCustomTitle: (workspaceId: string, terminalTabId: string, title: string) => void;
  /** Set/clear a pane's custom display label. Empty (after normalize) clears the override. */
  setPaneCustomLabel: (workspaceId: string, paneId: string, label: string, terminalTabId?: string) => void;
  /** Toggle a pane's keep-agent-name / keep-cwd display flags. */
  setPaneTitleFlags: (
    workspaceId: string,
    paneId: string,
    flags: { keepAgentName?: boolean; keepCwd?: boolean },
    terminalTabId?: string,
  ) => void;

  getProjectWikiPanes: (workspaceId: string) => Record<string, TerminalPaneProps>;
  getProjectWikiLayout: (workspaceId: string) => TerminalLayoutNode<string> | null;
  isProjectWikiReady: (workspaceId: string) => boolean;
  setProjectWikiLayout: (workspaceId: string, layout: TerminalLayoutNode<string> | null) => void;
  addProjectWikiTerminal: (workspaceId: string, label?: string, agent?: TerminalPaneAgent) => string;
  removeProjectWikiTerminal: (workspaceId: string, id: string) => void;
  splitProjectWikiTerminal: (workspaceId: string, id: string, direction: TerminalLayoutDirection, agent?: TerminalPaneAgent) => string | null;
  initProjectWikiWorkspace: (workspaceId: string) => void;
  loadProjectWikiFromTmux: (workspaceId: string) => Promise<void>;
  getProjectWikiPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string) => string | null;
  setProjectWikiDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string) => void;
  setProjectWikiOscTitle: (workspaceId: string, paneId: string, oscTitle: string | undefined) => void;
  setProjectWikiPaneAgent: (workspaceId: string, paneId: string, agent: TerminalPaneAgent) => void;
  markProjectWikiPaneAttached: (workspaceId: string, paneId: string) => void;
  toggleProjectWikiMaximize: (workspaceId: string, id: string) => void;

  codeReviewPanes: Record<string, Record<string, TerminalPaneProps>>;
  codeReviewLayouts: Record<string, TerminalLayoutNode<string> | null>;
  codeReviewMaximizedIds: Record<string, string | null>;
  codeReviewLoadedWorkspaces: Set<string>;
  codeReviewInitializingWorkspaces: Set<string>;
  getCodeReviewPanes: (workspaceId: string) => Record<string, TerminalPaneProps>;
  getCodeReviewLayout: (workspaceId: string) => TerminalLayoutNode<string> | null;
  isCodeReviewReady: (workspaceId: string) => boolean;
  setCodeReviewLayout: (workspaceId: string, layout: TerminalLayoutNode<string> | null) => void;
  addCodeReviewTerminal: (workspaceId: string, label?: string, agent?: TerminalPaneAgent) => string;
  removeCodeReviewTerminal: (workspaceId: string, id: string) => void;
  initCodeReviewWorkspace: (workspaceId: string) => void;
  loadCodeReviewFromTmux: (workspaceId: string) => Promise<void>;
  getCodeReviewPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string) => string | null;
  setCodeReviewDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string) => void;
  setCodeReviewOscTitle: (workspaceId: string, paneId: string, oscTitle: string | undefined) => void;
  setCodeReviewPaneAgent: (workspaceId: string, paneId: string, agent: TerminalPaneAgent) => void;
  markCodeReviewPaneAttached: (workspaceId: string, paneId: string) => void;
  toggleCodeReviewMaximize: (workspaceId: string, id: string) => void;
  splitCodeReviewTerminal: (workspaceId: string, id: string, direction: TerminalLayoutDirection, agent?: TerminalPaneAgent) => string | null;
}
