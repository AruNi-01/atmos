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

/**
 * Live display title for one pane.
 * Non-empty `customLabel` wins; otherwise canonical `getTerminalDisplayMeta`
 * (label / dynamicTitle / oscTitle / agent). Tmux window indexes are not titles.
 */
export function resolveLivePaneDisplayTitle(
  pane: ResourceMonitorPaneTitleSource,
): string | undefined {
  const custom = pane.customLabel?.trim();
  if (custom) return custom;

  // Tmux window indexes (`1`) are attach identities. Do not feed them to
  // `getTerminalDisplayMeta` as `baseTitle` — that helper can prefer the base
  // over a runtime-wrapper dynamic such as `npm run dev`.
  const baseTitle = isTmuxIndexTitle(pane.label) ? undefined : pane.label;
  const displayTitle = getTerminalDisplayMeta({
    baseTitle,
    dynamicTitle: pane.dynamicTitle,
    agent: pane.agent,
    oscTitle: pane.oscTitle,
  }).displayTitle.trim();
  if (displayTitle && !isTmuxIndexTitle(displayTitle)) return displayTitle;

  const dynamic = pane.dynamicTitle?.trim();
  if (dynamic && !isTmuxIndexTitle(dynamic)) return dynamic;
  return undefined;
}

/**
 * Flatten `workspacePanes` (scope → paneId → pane) into sessionId → title.
 *
 * Duplicate `sessionId`s across scopes use last-write-wins in object
 * enumeration order (insertion order). `sessionId` is expected to be globally
 * unique, so this is a defensive stable policy, not a merge.
 */
export function buildResourceMonitorSessionTitleMap(
  workspacePanes: ResourceMonitorWorkspacePanes | null | undefined,
): Map<string, string> {
  const titles = new Map<string, string>();
  if (!workspacePanes) return titles;

  for (const panes of Object.values(workspacePanes)) {
    if (!panes) continue;
    for (const pane of Object.values(panes)) {
      const sessionId = pane.sessionId?.trim();
      if (!sessionId) continue;
      const title = resolveLivePaneDisplayTitle(pane);
      if (title) titles.set(sessionId, title);
    }
  }
  return titles;
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
