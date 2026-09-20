"use client";

import { isIdleCwdTitle } from "@atmos/shared/terminal";
import type {
  TerminalLayoutBranch,
  TerminalLayoutNode,
  TerminalPaneAgent,
  TerminalPaneProps,
} from "../types/index";
import { getLeaves } from "@/features/terminal/lib/terminal-layout-tree";

export type TerminalGridScope = "default" | "project-wiki" | "code-review";

/** Control which toolbar action buttons to show. Omitted or true = show, false = hide. */
export interface TerminalToolbarActions {
  /** Split horizontal/vertical buttons */
  split?: boolean;
  /** Maximize/restore button */
  maximize?: boolean;
  /** Close pane button */
  close?: boolean;
}

export interface TerminalGridProps {
  workspaceId: string;
  className?: string;
  terminalTabId?: string;
  quickOpenAgents?: Array<{
    agent: TerminalPaneAgent;
    command: string;
  }>;
  /** When "project-wiki", uses separate panes/layout (does not affect main Terminal tab) */
  scope?: TerminalGridScope;
  /** Which toolbar action buttons to show. Default: all true. Use e.g. { split: false, maximize: false, close: false } for Project Wiki. */
  toolbarActions?: TerminalToolbarActions;
  /** When true, workspaceId refers to a project ID (use project layout API). When false, it's a workspace ID. */
  isProjectContext?: boolean;
  /** Create a new center-stage terminal tab. Triggered by scoped Cmd+T in terminal grids. */
  onNewTerminalTab?: () => void;
  /** Notifies the center stage after a default-scope pane has been destroyed. */
  onTerminalPaneClosed?: (event: {
    paneId: string;
    pane: TerminalPaneProps;
    terminalTabId: string;
    isLastPane: boolean;
  }) => void;
  /**
   * False while this grid's host frame/tab is hidden (warm keep-alive).
   * Forwards to each Terminal so fit/ResizeObserver stay off-screen quiet.
   */
  isSurfaceActive?: boolean;
}

export interface TerminalGridHandle {
  addTerminal: (label?: string, agent?: TerminalPaneAgent) => void;
  /** Create a new terminal tab and run command after session is ready */
  createAndRunTerminal: (options: {
    label: string;
    command: string;
    agent?: TerminalPaneAgent;
    agentId?: string;
    tuiFollowUpPrompt?: string;
    /** Default true. Live/headless runs pass false so we never steal the user's shell. */
    reuseIdlePane?: boolean;
    /** Default true. Live/headless runs pass false so the editor keeps focus. */
    focus?: boolean;
    /** Connect the new pane even if the grid is keep-mounted and off-screen. */
    connectWhileHidden?: boolean;
  }) => Promise<{ paneId: string; sessionId?: string } | null>;
  /** Create or focus terminal by label/window name (e.g. "Generate Project Wiki") and run command. Reuses existing pane if found. */
  createOrFocusAndRunTerminal: (options: {
    label: string;
    command: string;
    agent?: TerminalPaneAgent;
    agentId?: string;
    tuiFollowUpPrompt?: string;
  }) => Promise<void>;
  /** Remove terminal pane by tmux window name. Used when killing backend tmux window before replace. */
  removeTerminalByTmuxWindowName: (tmuxWindowName: string) => boolean;
  /** Create a new terminal and pre-fill command text without executing it */
  prefillTerminal: (options: { label: string; command: string; agent?: TerminalPaneAgent }) => void;
  destroyAllTerminals: () => void;
  /** Focus the currently active pane's terminal input */
  focusActivePane: () => void;
  /** Focus pane whose tmux window name matches (current grid scope). Returns false if not found. */
  focusPaneByTmuxWindowName: (tmuxWindowName: string) => boolean;
}

export const DEFAULT_TOOLBAR_ACTIONS: Required<TerminalToolbarActions> = {
  split: true,
  maximize: true,
  close: true,
};

const IDLE_SHELL_COMMANDS = new Set([
  "bash",
  "zsh",
  "fish",
  "sh",
  "dash",
  "ksh",
  "mksh",
  "tcsh",
  "csh",
  "nu",
  "xonsh",
]);

export function isIdleShellCommand(command: string | null | undefined): boolean {
  const normalized = command?.trim().split("/").filter(Boolean).pop()?.toLowerCase();
  return Boolean(normalized && IDLE_SHELL_COMMANDS.has(normalized));
}

/** Minimal tmux window fields used when probing busy/idle before close. */
export type TmuxWindowBusyProbe = {
  name: string;
  index?: number | string;
  current_command?: string | null;
};

export type TerminalPaneBusyProbe = {
  dynamicTitle?: string;
  tmuxWindowName?: string;
  label?: string;
};

export function findMatchingTmuxWindow(
  windows: TmuxWindowBusyProbe[],
  pane: TerminalPaneBusyProbe,
): TmuxWindowBusyProbe | undefined {
  if (pane.tmuxWindowName) {
    const byName = windows.find((window) => window.name === pane.tmuxWindowName);
    if (byName) return byName;
    const byIndex = windows.find((window) => String(window.index) === pane.tmuxWindowName);
    if (byIndex) return byIndex;
  }
  // Label is a last resort. Extra-space panes keep a local label like "1"
  // while the tmux name is namespaced (`cs__space-abc__1`); matching by label
  // first would pick the host window named "1" instead.
  if (pane.label && pane.label !== pane.tmuxWindowName) {
    return windows.find((window) => window.name === pane.label);
  }
  return undefined;
}

/**
 * Whether a pane should require close confirmation (same policy as panel close).
 *
 * Confirm when either signal says work is running:
 * - tmux foreground command is not a known idle shell
 * - dynamic title is a live command / agent binary (not a CMD_END cwd)
 *
 * Idle without confirm when:
 * - no tmux window identity yet
 * - tmux foreground is an idle shell and the title is cwd-style or empty
 * - tmux list is unavailable and the title is a CMD_END cwd
 *
 * When `tmuxWindows` is null (list failed / unavailable) and the title is not a
 * cwd, treat the pane as non-idle so we still confirm rather than silently killing work.
 */
export function isTerminalPaneNonIdle(
  pane: TerminalPaneBusyProbe,
  tmuxWindows: TmuxWindowBusyProbe[] | null,
): boolean {
  if (!pane.tmuxWindowName) return false;

  const cwdTitle = isIdleCwdTitle(pane.dynamicTitle);
  const titleLooksBusy =
    Boolean(pane.dynamicTitle?.trim()) &&
    !cwdTitle &&
    !isIdleShellCommand(pane.dynamicTitle);

  if (!tmuxWindows) {
    return !cwdTitle;
  }

  const tmuxWindow = findMatchingTmuxWindow(tmuxWindows, pane);
  if (tmuxWindow && isIdleShellCommand(tmuxWindow.current_command)) {
    return titleLooksBusy;
  }
  return true;
}

/** True if any pane in the set should require close confirmation. */
export function hasNonIdleTerminalPanes(
  panes: TerminalPaneBusyProbe[],
  tmuxWindows: TmuxWindowBusyProbe[] | null,
): boolean {
  return panes.some((pane) => isTerminalPaneNonIdle(pane, tmuxWindows));
}

export function flattenTerminalLayout(layout: TerminalLayoutNode<string> | null): string[] {
  return getLeaves(layout);
}
