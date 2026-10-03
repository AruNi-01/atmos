import { isTmuxIndexTitle } from "@atmos/shared/terminal";
import type { ContestedOwnersMap } from "@atmos/shared/terminal";
import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import {
  readCachedOscTitle,
} from "@/features/terminal/lib/terminal-dynamic-title-cache";
import { resolvePaneToolbarTitle } from "@/features/terminal/lib/terminal-center-tab-presentation";
import {
  extraCenterSpaceTmuxWindowPrefix,
  TERMINAL_TAB_VALUE_PREFIX,
} from "@/features/terminal/store/terminal-store-helpers";
import type { TerminalPaneProps } from "@/features/terminal/types/index";

/** Placeholder from `composePaneDisplayTitle` when a pane has no topic yet. */
const GENERIC_TERMINAL_TITLE = "Terminal";

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
): { pane: TerminalPaneProps; scopeKey: string } | null {
  for (const panesByScope of maps) {
    if (!panesByScope) continue;
    for (const [scopeKey, panes] of Object.entries(panesByScope)) {
      if (hostIdFromCenterKey(paintIdFromScopeKey(scopeKey)) !== hostId) continue;
      for (const pane of Object.values(panes ?? {})) {
        if (pane.tmuxWindowName === tmuxWindowName) return { pane, scopeKey };
      }
    }
  }
  return null;
}

function isGenericTerminalTitle(title: string | null | undefined): boolean {
  const value = title?.trim() ?? "";
  return !value || value === GENERIC_TERMINAL_TITLE || isTmuxIndexTitle(value);
}

/**
 * Stable OSC topic cached for a window that is not hydrated yet.
 * Titles are intentionally absent from the center layout document; opening
 * the workspace is what copies this cache back onto the live pane.
 */
function cachedOscTopic(
  workspaceId: string,
  tmuxWindowName: string,
  agentLabel: string,
): string | null {
  const topic = uniquePaneTitleForAgentStatus(
    readCachedOscTitle(workspaceId, tmuxWindowName),
    agentLabel,
  );
  if (!topic || isGenericTerminalTitle(topic)) return null;
  return topic;
}

function cachedTopicForSession(
  stablePaneId: string,
  located: { pane: TerminalPaneProps; scopeKey: string } | null,
  agentLabel: string,
): string | null {
  const parts = splitStablePaneId(stablePaneId);
  const paintId = located ? paintIdFromScopeKey(located.scopeKey) : null;
  const workspaceIds = new Set<string>();
  if (parts?.hostId) workspaceIds.add(parts.hostId);
  if (located?.pane.workspaceId) workspaceIds.add(located.pane.workspaceId);
  if (paintId) workspaceIds.add(paintId);

  const windowNames = new Set<string>();
  if (parts?.tmuxWindowName) windowNames.add(parts.tmuxWindowName);
  const paneWindow = located?.pane.tmuxWindowName || located?.pane.label;
  if (paneWindow) windowNames.add(paneWindow);
  if (paintId && located?.pane.tmuxWindowName) {
    const prefix = extraCenterSpaceTmuxWindowPrefix(paintId);
    if (prefix && located.pane.tmuxWindowName.startsWith(prefix)) {
      windowNames.add(located.pane.tmuxWindowName.slice(prefix.length));
    }
  }

  for (const workspaceId of workspaceIds) {
    for (const windowName of windowNames) {
      const topic = cachedOscTopic(workspaceId, windowName, agentLabel);
      if (topic) return topic;
    }
  }
  return null;
}

/** Live terminal pane for a hook session's stable pane id (`{host}:{tmuxWindow}`). */
export function findTerminalPaneByStableAgentPaneId(
  state: AgentHookPaneLookupState,
  stablePaneId: string,
): TerminalPaneProps | null {
  const located = locateTerminalPane(state, stablePaneId);
  return located?.pane ?? null;
}

function locateTerminalPane(
  state: AgentHookPaneLookupState,
  stablePaneId: string,
): { pane: TerminalPaneProps; scopeKey: string } | null {
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
/**
 * Terminal inbox rows stay only while that pane is still an agent.
 * A closed window, or a shell whose title has fallen back to a path, is not
 * an agent session anymore. If this host's terminals are not loaded yet, keep
 * the catalog row until we can see the pane.
 */
export function terminalSessionIsCurrentAgent(
  sessionId: string,
  state: AgentHookPaneLookupState,
): boolean {
  const pane = findTerminalPaneByStableAgentPaneId(state, sessionId);
  if (pane) return !paneTitleIndicatesAgentExited(pane);
  const colon = sessionId.indexOf(":");
  if (colon <= 0) return true;
  const hostId = sessionId.slice(0, colon).trim();
  if (!hostId) return true;
  return !hostHasLoadedTerminalPanes(state, hostId);
}

function hostHasLoadedTerminalPanes(
  state: AgentHookPaneLookupState,
  hostId: string,
): boolean {
  const maps = [state.workspacePanes, state.projectWikiPanes, state.codeReviewPanes];
  for (const panesByScope of maps) {
    if (!panesByScope) continue;
    for (const [scopeKey, panes] of Object.entries(panesByScope)) {
      if (hostIdFromCenterKey(paintIdFromScopeKey(scopeKey)) !== hostId) continue;
      if (Object.keys(panes ?? {}).length > 0) return true;
    }
  }
  return false;
}

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

function chatIdFromStatusSession(sessionId: string | null | undefined): string | null {
  const id = sessionId?.trim() ?? "";
  if (!id.startsWith("chat:")) return null;
  return id.slice("chat:".length) || null;
}

export function collectAgentStatusSessionTitles(
  sessions: Array<{
    session_id: string;
    tool: string;
    surface?: string | null;
    surface_id?: string | null;
    pane_id?: string | null;
  }>,
  input: {
    contestedOwners: ContestedOwnersMap;
    panes: AgentHookPaneLookupState;
    chatTabs: ReadonlyArray<{ chatId: string | null; title?: string | null }>;
    agentLabel: (tool: string) => string;
  },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const session of sessions) {
    if (session.surface === "chat") {
      const chatId = session.surface_id?.trim() || chatIdFromStatusSession(session.session_id);
      const title = chatId
        ? input.chatTabs.find((tab) => tab.chatId === chatId)?.title?.trim()
        : "";
      if (title) out[session.session_id] = title;
      continue;
    }
    const paneId = session.pane_id?.trim() || session.session_id;
    const agentLabel = input.agentLabel(session.tool);
    const located = locateTerminalPane(input.panes, paneId);
    let suffix: string | null = null;
    if (located) {
      const resolved = resolvePaneToolbarTitle(located.pane, {
        contestedOwners: input.contestedOwners,
      });
      suffix = uniquePaneTitleForAgentStatus(resolved.displayTitle, agentLabel);
    }
    // A numeric tmux window with no OSC yet resolves to the placeholder
    // "Terminal". The real topic is already in the title cache; switching
    // to that workspace only copies the cache onto the pane.
    if (isGenericTerminalTitle(suffix)) {
      suffix = cachedTopicForSession(paneId, located, agentLabel);
    }
    if (suffix && !isGenericTerminalTitle(suffix)) out[session.session_id] = suffix;
  }
  return out;
}
