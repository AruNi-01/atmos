"use client";

import type { MosaicNode } from "react-mosaic-component";
import type { MosaicBranch, TerminalPaneAgent } from "../types/index";

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
}

export interface TerminalGridHandle {
  addTerminal: (label?: string, agent?: TerminalPaneAgent) => void;
  /** Create a new terminal tab and run command after session is ready */
  createAndRunTerminal: (options: { label: string; command: string; agent?: TerminalPaneAgent }) => Promise<void>;
  /** Create or focus terminal by label/window name (e.g. "Generate Project Wiki") and run command. Reuses existing pane if found. */
  createOrFocusAndRunTerminal: (options: { label: string; command: string; agent?: TerminalPaneAgent }) => Promise<void>;
  /** Remove terminal pane by tmux window name. Used when killing backend tmux window before replace. */
  removeTerminalByTmuxWindowName: (tmuxWindowName: string) => void;
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

export function flattenMosaicLayout(layout: MosaicNode<string> | null): string[] {
  if (!layout) return [];
  if (typeof layout === "string") return [layout];
  const branch = layout as MosaicBranch<string>;
  return [...flattenMosaicLayout(branch.first), ...flattenMosaicLayout(branch.second)];
}
