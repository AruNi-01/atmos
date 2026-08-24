import {
  CENTER_SPACE_KEY_MARK,
  DEFAULT_CENTER_SPACE_ID,
  hostIdFromCenterKey,
  makeCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";

/** Live pane fields the locator reads. Store-shaped, no title/agent data. */
export type LiveResourceSessionPane = {
  sessionId?: string | null;
  workspaceId?: string | null;
  tmuxWindowName?: string | null;
};

export type LiveResourceSessionPanes = Record<
  string,
  Record<string, LiveResourceSessionPane>
>;

export type LiveResourceSessionLocation = {
  hostId: string;
  spaceId: string;
  paintContextId: string;
  terminalTabId: string;
  paneId: string;
  sessionId: string;
  tmuxWindowName?: string;
};

export type ParsedTerminalWorkspaceScope = {
  hostId: string;
  spaceId: string;
  paintContextId: string;
  terminalTabId: string;
};

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parse a `workspacePanes` scope key.
 *
 * - default fixed: `host`
 * - default custom: `host::tab`
 * - extra fixed: `host::space::spaceId`
 * - extra custom: `host::space::spaceId::tab`
 *
 * Scope is the tab/space truth. Tmux namespacing is not used here.
 */
export function parseTerminalWorkspaceScopeKey(
  scopeKey: string,
): ParsedTerminalWorkspaceScope | null {
  const key = trimOrEmpty(scopeKey);
  if (!key) return null;

  const markIndex = key.indexOf(CENTER_SPACE_KEY_MARK);
  if (markIndex === -1) {
    const sep = key.indexOf("::");
    if (sep === -1) {
      return {
        hostId: key,
        spaceId: DEFAULT_CENTER_SPACE_ID,
        paintContextId: key,
        terminalTabId: FIXED_TERMINAL_TAB_VALUE,
      };
    }
    const hostId = key.slice(0, sep);
    const terminalTabId = key.slice(sep + 2);
    if (!hostId || !terminalTabId) return null;
    return {
      hostId,
      spaceId: DEFAULT_CENTER_SPACE_ID,
      paintContextId: hostId,
      terminalTabId,
    };
  }

  const hostId = key.slice(0, markIndex);
  const rest = key.slice(markIndex + CENTER_SPACE_KEY_MARK.length);
  if (!hostId || !rest) return null;
  const tabSep = rest.indexOf("::");
  const spaceId = tabSep === -1 ? rest : rest.slice(0, tabSep);
  const terminalTabId = tabSep === -1 ? FIXED_TERMINAL_TAB_VALUE : rest.slice(tabSep + 2);
  if (!spaceId || !terminalTabId) return null;
  return {
    hostId,
    spaceId,
    paintContextId: makeCenterSpaceKey(hostId, spaceId),
    terminalTabId,
  };
}

function sameOptionalTmux(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return trimOrEmpty(left) === trimOrEmpty(right);
}

export function matchesLiveResourceLocateTarget(
  target: LiveResourceSessionLocation | null | undefined,
  candidate: {
    hostId: string;
    paintContextId: string;
    terminalTabId: string;
    paneId: string;
    sessionId?: string | null;
    tmuxWindowName?: string | null;
  },
): boolean {
  if (!target) return false;
  const sessionId = trimOrEmpty(candidate.sessionId);
  if (!sessionId || sessionId !== target.sessionId) return false;
  if (candidate.hostId !== target.hostId) return false;
  if (candidate.paintContextId !== target.paintContextId) return false;
  if (candidate.terminalTabId !== target.terminalTabId) return false;
  if (candidate.paneId !== target.paneId) return false;
  return sameOptionalTmux(candidate.tmuxWindowName, target.tmuxWindowName);
}

export function shouldArriveResourceLocate(args: {
  surfaceActive: boolean;
  phase: "idle" | "pending" | "active";
  target: LiveResourceSessionLocation | null | undefined;
  candidate: {
    hostId: string;
    paintContextId: string;
    terminalTabId: string;
    paneId: string;
    sessionId?: string | null;
    tmuxWindowName?: string | null;
  };
}): boolean {
  return (
    args.surfaceActive &&
    args.phase === "pending" &&
    matchesLiveResourceLocateTarget(args.target, args.candidate)
  );
}

export function applyResourceLocateArrival(args: {
  paneId: string;
  generation: number;
  setActivePaneId: (id: string) => void;
  scheduleFocus: (run: () => void) => void;
  focusPane: () => void;
  arrive: (generation: number) => void;
}): void {
  args.setActivePaneId(args.paneId);
  args.scheduleFocus(args.focusPane);
  args.arrive(args.generation);
}

export function shouldShowResourceLocateRing(args: {
  phase: "idle" | "pending" | "active";
  target: LiveResourceSessionLocation | null | undefined;
  candidate: {
    hostId: string;
    paintContextId: string;
    terminalTabId: string;
    paneId: string;
    sessionId?: string | null;
    tmuxWindowName?: string | null;
  };
}): boolean {
  return (
    args.phase === "active" &&
    matchesLiveResourceLocateTarget(args.target, args.candidate)
  );
}

/**
 * Resolve a live attributed session to its host / Center Space / tab / pane.
 *
 * `sessionId` miss or null never guesses. Scope is the tab truth; a namespaced
 * tmux window may cross-check space but cannot override scope. Duplicate
 * `sessionId`s on the same host use last-write-wins in object enumeration
 * order (session IDs are expected to be unique).
 */
export function findLiveResourceSessionLocation(
  workspacePanes: LiveResourceSessionPanes | null | undefined,
  hostId: string,
  sessionId: string | null | undefined,
): LiveResourceSessionLocation | null {
  const wantedHost = trimOrEmpty(hostId);
  const wantedSession = trimOrEmpty(sessionId);
  if (!wantedHost || !wantedSession || !workspacePanes) return null;

  let hit: LiveResourceSessionLocation | null = null;

  for (const [scopeKey, panes] of Object.entries(workspacePanes)) {
    const scope = parseTerminalWorkspaceScopeKey(scopeKey);
    if (!scope || scope.hostId !== wantedHost) continue;
    if (!panes) continue;

    for (const [paneId, pane] of Object.entries(panes)) {
      const paneSession = trimOrEmpty(pane.sessionId);
      if (!paneSession || paneSession !== wantedSession) continue;

      const paneHost = trimOrEmpty(pane.workspaceId);
      if (!paneHost || hostIdFromCenterKey(paneHost) !== wantedHost) continue;

      const tmuxWindowName = trimOrEmpty(pane.tmuxWindowName) || undefined;

      hit = {
        hostId: scope.hostId,
        spaceId: scope.spaceId,
        paintContextId: scope.paintContextId,
        terminalTabId: scope.terminalTabId,
        paneId,
        sessionId: paneSession,
        ...(tmuxWindowName ? { tmuxWindowName } : {}),
      };
    }
  }

  return hit;
}
