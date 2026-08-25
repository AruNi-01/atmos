import {
  getTerminalDisplayMeta,
  isTmuxIndexTitle,
  type TerminalTitleAgent,
} from "@atmos/shared/terminal";

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
 * Non-empty `customLabel` wins; otherwise canonical `getTerminalDisplayMeta`
 * (label / dynamicTitle / oscTitle / agent). Tmux window indexes are not titles.
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

  // Tmux window indexes (`1`) are attach identities. Do not feed them to
  // `getTerminalDisplayMeta` as `baseTitle` — that helper can prefer the base
  // over a runtime-wrapper dynamic such as `npm run dev`.
  const baseTitle = isTmuxIndexTitle(pane.label) ? undefined : pane.label;
  const meta = getTerminalDisplayMeta({
    baseTitle,
    dynamicTitle: pane.dynamicTitle,
    configuredAgents: pane.agent ? [pane.agent] : [],
    agent: pane.agent,
    oscTitle: pane.oscTitle,
  });
  const displayTitle = meta.displayTitle.trim();
  if (displayTitle && !isTmuxIndexTitle(displayTitle)) {
    return {
      displayTitle,
      toolbarAgent: meta.toolbarAgent,
    };
  }

  const dynamic = pane.dynamicTitle?.trim();
  if (dynamic && !isTmuxIndexTitle(dynamic)) {
    return {
      displayTitle: dynamic,
      toolbarAgent: meta.toolbarAgent,
    };
  }
  return undefined;
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
