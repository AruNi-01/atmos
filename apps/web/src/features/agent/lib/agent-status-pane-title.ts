import { isTmuxIndexTitle } from "@atmos/shared/terminal";
import type { ContestedOwnersMap } from "@atmos/shared/terminal";
import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import { TERMINAL_TAB_VALUE_PREFIX } from "@/features/terminal/store/terminal-store-helpers";
import { resolvePaneToolbarTitle } from "@/features/terminal/lib/terminal-center-tab-presentation";
import type { TerminalPaneProps } from "@/features/terminal/types/index";

export type AgentHookPaneLookupState = {
  workspacePanes: Record<string, Record<string, TerminalPaneProps>>;
  projectWikiPanes?: Record<string, Record<string, TerminalPaneProps>>;
  codeReviewPanes?: Record<string, Record<string, TerminalPaneProps>>;
};

function paintIdFromScopeKey(scopeKey: string): string {
  const marker = `::${TERMINAL_TAB_VALUE_PREFIX}`;
  const idx = scopeKey.indexOf(marker);
  return idx === -1 ? scopeKey : scopeKey.slice(0, idx);
}

function splitStablePaneId(
  stablePaneId: string,
): { hostId: string; tmuxWindowName: string } | null {
  const id = stablePaneId.trim();
  const idx = id.indexOf(":");
  if (idx <= 0) return null;
  const hostId = id.slice(0, idx).trim();
  const tmuxWindowName = id.slice(idx + 1).trim();
  if (!hostId || !tmuxWindowName) return null;
  return { hostId, tmuxWindowName };
}

function matchPaneInMaps(
  maps: Array<Record<string, Record<string, TerminalPaneProps>> | undefined>,
  hostId: string,
  tmuxWindowName: string,
): TerminalPaneProps | null {
  for (const panesByScope of maps) {
    if (!panesByScope) continue;
    for (const [scopeKey, panes] of Object.entries(panesByScope)) {
      if (hostIdFromCenterKey(paintIdFromScopeKey(scopeKey)) !== hostId) continue;
      for (const pane of Object.values(panes ?? {})) {
        if (pane.tmuxWindowName === tmuxWindowName) return pane;
      }
    }
  }
  return null;
}

/** Live terminal pane for a hook session's stable pane id (`{host}:{tmuxWindow}`). */
export function findTerminalPaneByStableAgentPaneId(
  state: AgentHookPaneLookupState,
  stablePaneId: string,
): TerminalPaneProps | null {
  const parts = splitStablePaneId(stablePaneId);
  if (!parts) return null;
  return matchPaneInMaps(
    [state.workspacePanes, state.projectWikiPanes, state.codeReviewPanes],
    parts.hostId,
    parts.tmuxWindowName,
  );
}

/**
 * Strip the agent brand already shown in Agent status so the suffix matches
 * the changing part of the pane toolbar title (`Claude Code | topic` → `topic`,
 * or just `topic` when brand text is hidden).
 */
export function uniquePaneTitleForAgentStatus(
  displayTitle: string | null | undefined,
  agentLabel: string | null | undefined,
): string | null {
  let title = displayTitle?.trim() ?? "";
  if (!title) return null;
  const label = agentLabel?.trim() ?? "";
  if (!label) return title;
  if (title === label) return null;

  const separators = [" | ", " · ", " - "];
  for (const sep of separators) {
    if (title.startsWith(label + sep)) {
      title = title.slice(label.length + sep.length).trim();
      break;
    }
    if (title.endsWith(sep + label)) {
      title = title.slice(0, title.length - sep.length - label.length).trim();
      break;
    }
  }
  if (!title || title === label) return null;
  return title;
}

/**
 * True when the pane toolbar no longer brands the agent — typically after the
 * CLI exits and the live title returns to a cwd / unrelated command.
 */
export function paneTitleIndicatesAgentExited(
  pane: TerminalPaneProps,
  options?: {
    contestedOwners?: ContestedOwnersMap;
  },
): boolean {
  const dynamic = pane.dynamicTitle?.trim();
  if (!dynamic || isTmuxIndexTitle(dynamic)) return false;
  const resolved = resolvePaneToolbarTitle(pane, options);
  return !resolved.toolbarAgent;
}
