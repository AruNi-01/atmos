"use client";

import type { MosaicDirection, MosaicNode } from "react-mosaic-component";
import type { TmuxWindow } from "@/api/rest-api";
import type {
  TerminalPaneAgent,
  TerminalPaneProps,
} from "@/features/terminal/types/index";
import type { PersistedTerminalWorkspaceLayoutDocument } from "@/features/terminal/lib/terminal-layout-document";
import type { TerminalCenterTab } from "@/features/terminal/store/terminal-store-helpers";

export interface TerminalStore {
  workspaceTerminalTabs: Record<string, TerminalCenterTab[]>;
  workspaceActiveTerminalTabIds: Record<string, string>;
  workspacePanes: Record<string, Record<string, TerminalPaneProps>>;
  workspaceLayouts: Record<string, MosaicNode<string> | null>;
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
  projectWikiLayouts: Record<string, MosaicNode<string> | null>;
  projectWikiMaximizedIds: Record<string, string | null>;
  projectWikiLoadedWorkspaces: Set<string>;
  projectWikiInitializingWorkspaces: Set<string>;

  getTerminalTabs: (workspaceId: string) => TerminalCenterTab[];
  getActiveTerminalTabId: (workspaceId: string) => string;
  setActiveTerminalTab: (workspaceId: string, terminalTabId: string) => void;
  createTerminalTab: (workspaceId: string) => TerminalCenterTab;
  closeTerminalTab: (workspaceId: string, terminalTabId: string) => void;
  getPanes: (workspaceId: string, terminalTabId?: string) => Record<string, TerminalPaneProps>;
  getLayout: (workspaceId: string, terminalTabId?: string) => MosaicNode<string> | null;
  getPaneIdByTmuxWindowName: (workspaceId: string, tmuxWindowName: string, terminalTabId?: string) => string | null;
  getMaximizedTerminalId: (workspaceId: string, terminalTabId?: string) => string | null;
  isWorkspaceReady: (workspaceId: string, terminalTabId?: string) => boolean;
  setLayout: (workspaceId: string, layout: MosaicNode<string> | null, terminalTabId?: string) => void;
  addTerminal: (workspaceId: string, label?: string, terminalTabId?: string, agent?: TerminalPaneAgent) => string;
  removeTerminal: (workspaceId: string, id: string, terminalTabId?: string) => void;
  splitTerminal: (workspaceId: string, id: string, direction: MosaicDirection, terminalTabId?: string, agent?: TerminalPaneAgent) => string | null;
  toggleMaximize: (workspaceId: string, id: string, terminalTabId?: string) => void;

  primeWorkspace: (workspaceId: string, isProjectContext?: boolean) => void;
  initWorkspace: (workspaceId: string, isProjectContext?: boolean, terminalTabId?: string) => void;
  evictWorkspaceRuntime: (workspaceId: string) => void;

  loadFromBackend: (workspaceId: string, isProjectContext?: boolean, terminalTabId?: string | null) => Promise<void>;
  saveToBackend: (workspaceId: string, isProjectContext?: boolean) => void;
  fetchTmuxWindows: (workspaceId: string) => Promise<TmuxWindow[]>;

  setTmuxWindowName: (workspaceId: string, paneId: string, tmuxWindowName: string, terminalTabId?: string) => void;
  markPaneAttached: (workspaceId: string, paneId: string, terminalTabId?: string) => void;
  setDynamicTitle: (workspaceId: string, paneId: string, dynamicTitle: string, terminalTabId?: string) => void;
  setPaneAgent: (workspaceId: string, paneId: string, agent: TerminalPaneAgent, terminalTabId?: string) => void;

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
  markProjectWikiPaneAttached: (workspaceId: string, paneId: string) => void;
  toggleProjectWikiMaximize: (workspaceId: string, id: string) => void;

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
  markCodeReviewPaneAttached: (workspaceId: string, paneId: string) => void;
  toggleCodeReviewMaximize: (workspaceId: string, id: string) => void;
  splitCodeReviewTerminal: (workspaceId: string, id: string, direction: MosaicDirection, agent?: TerminalPaneAgent) => string | null;
}
