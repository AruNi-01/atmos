import { isTmuxIndexTitle, type TerminalTitleAgent } from "@atmos/shared/terminal";
import { resolvePaneTitleForCenterTab } from "@/features/terminal/lib/terminal-center-tab-presentation";
import type { TerminalPaneAgent, TerminalPaneProps } from "@/features/terminal/types";

/** Pane fields Resource Monitor reads for live titles. Store-shaped, display-only. */
export type ResourceMonitorPaneTitleSource = {
  sessionId?: string | null;
  label?: string;
  customLabel?: string;
  dynamicTitle?: string;
  oscTitle?: string;
  agent?: TerminalTitleAgent;
};

export type ResourceMonitorWorkspacePanes = Record<
  string,
  Record<string, ResourceMonitorPaneTitleSource>
>;

export type ResourceMonitorSessionDisplay = {
  displayTitle: string;
  toolbarAgent: TerminalTitleAgent | undefined;
};

/**
 * Live display title for one pane.
 *
 * Same stable session topic as the center terminal tab
 * (`resolvePaneTitleForCenterTab`): builtin agents so a typed `grok-1.0.46`
 * brands Grok Build, and the row shows the session topic instead of
 * `grok-1.0.46 | topic`.
 *
 * Non-empty `customLabel` still wins as the row text (the icon stays separate).
 * Tmux window indexes are not titles.
 */
export function resolveLivePaneDisplay(
  pane: ResourceMonitorPaneTitleSource,
): ResourceMonitorSessionDisplay | undefined {
  const custom = pane.customLabel?.trim();
  if (custom) {
    return {
      displayTitle: custom,
      toolbarAgent: pane.agent,
    };
  }

  const resolved = resolvePaneTitleForCenterTab(centerTabPane(pane));
  const toolbarAgent = preferStoredAgent(pane.agent, resolved.toolbarAgent);
  const displayTitle = resolved.displayTitle.trim();
  if (displayTitle && displayTitle !== "Terminal" && !isTmuxIndexTitle(displayTitle)) {
    return { displayTitle, toolbarAgent };
  }

  // Center-tab compose returns "Terminal" when a tmux index would have hidden
  // a runtime-wrapper command (`npm run dev`). Keep that command.
  const dynamic = pane.dynamicTitle?.trim();
  if (dynamic && !isTmuxIndexTitle(dynamic)) {
    return { displayTitle: dynamic, toolbarAgent };
  }
  return undefined;
}

/**
 * Pane shape for the shared center-tab resolver.
 * A tmux window index is an attach id. Feeding it as `baseTitle` makes
 * `getTerminalDisplayMeta` prefer `1` over a runtime-wrapper command.
 */
function centerTabPane(pane: ResourceMonitorPaneTitleSource): TerminalPaneProps {
  const label = pane.label?.trim() && !isTmuxIndexTitle(pane.label) ? pane.label : "";
  return {
    id: pane.sessionId?.trim() || "resource-monitor-pane",
    label,
    sessionId: pane.sessionId ?? "",
    workspaceId: "",
    dynamicTitle: pane.dynamicTitle,
    oscTitle: pane.oscTitle,
    agent: toPaneAgent(pane.agent),
  };
}

function toPaneAgent(agent: TerminalTitleAgent | undefined): TerminalPaneAgent | undefined {
  if (!agent) return undefined;
  return {
    id: agent.id,
    label: agent.label,
    command: agent.command,
    iconType: agent.iconType === "custom" ? "custom" : "built-in",
    pipeCommand: agent.pipeCommand,
  };
}

/** Keep the store's agent object when it is the same match the tab resolved. */
function preferStoredAgent(
  stored: TerminalTitleAgent | undefined,
  resolved: TerminalPaneAgent | undefined,
): TerminalTitleAgent | undefined {
  if (!resolved) return undefined;
  if (stored && stored.id === resolved.id) return stored;
  return resolved;
}

export function resolveLivePaneDisplayTitle(
  pane: ResourceMonitorPaneTitleSource,
): string | undefined {
  return resolveLivePaneDisplay(pane)?.displayTitle;
}

/**
 * Flatten `workspacePanes` (scope → paneId → pane) into sessionId → display.
 *
 * Duplicate `sessionId`s across scopes use last-write-wins in object
 * enumeration order (insertion order). `sessionId` is expected to be globally
 * unique, so this is a defensive stable policy, not a merge.
 */
export function buildResourceMonitorSessionDisplayMap(
  workspacePanes: ResourceMonitorWorkspacePanes | null | undefined,
): Map<string, ResourceMonitorSessionDisplay> {
  const displays = new Map<string, ResourceMonitorSessionDisplay>();
  if (!workspacePanes) return displays;

  for (const panes of Object.values(workspacePanes)) {
    if (!panes) continue;
    for (const pane of Object.values(panes)) {
      const sessionId = pane.sessionId?.trim();
      if (!sessionId) continue;
      const display = resolveLivePaneDisplay(pane);
      if (display) displays.set(sessionId, display);
    }
  }
  return displays;
}

export function buildResourceMonitorSessionTitleMap(
  workspacePanes: ResourceMonitorWorkspacePanes | null | undefined,
): Map<string, string> {
  return new Map(
    [...buildResourceMonitorSessionDisplayMap(workspacePanes)].map(
      ([sessionId, display]) => [sessionId, display.displayTitle],
    ),
  );
}

/**
 * Session row label:
 * 1. frontend live title map
 * 2. server `name` when it is not a pure tmux index
 * 3. localized unnamed fallback
 *
 * Display-only — never write this back onto the WS snapshot DTO.
 */
export function resolveResourceMonitorSessionTitle(
  sessionId: string,
  serverName: string | null | undefined,
  liveTitles: ReadonlyMap<string, string>,
  unnamedFallback: string,
): string {
  const live = liveTitles.get(sessionId)?.trim();
  if (live) return live;
  const server = serverName?.trim();
  if (server && !isTmuxIndexTitle(server)) return server;
  return unnamedFallback;
}

export function resolveResourceMonitorSessionDisplay(
  sessionId: string,
  serverName: string | null | undefined,
  liveDisplays: ReadonlyMap<string, ResourceMonitorSessionDisplay>,
  unnamedFallback: string,
): ResourceMonitorSessionDisplay {
  const live = liveDisplays.get(sessionId);
  if (live?.displayTitle.trim()) {
    return {
      displayTitle: live.displayTitle.trim(),
      toolbarAgent: live.toolbarAgent,
    };
  }
  const server = serverName?.trim();
  return {
    displayTitle: server && !isTmuxIndexTitle(server) ? server : unnamedFallback,
    toolbarAgent: undefined,
  };
}
