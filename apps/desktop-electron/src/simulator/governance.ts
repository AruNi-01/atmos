export const WARM_SESSION_CAP = 2;
export const HIDE_THROTTLE_MS = 5_000;
export const IDLE_RELEASE_MS = 10 * 60 * 1000;
export const THROTTLE_MAX_FPS = 5;
export const THROTTLE_MAX_DIMENSION = 720;

export type GovernanceSession = {
  workspaceId: string;
  visibleSurfaces: number;
  lastVisibleAt: number;
};

export function shouldThrottle(
  session: GovernanceSession,
  now: number,
): boolean {
  return (
    session.visibleSurfaces <= 0 &&
    now - session.lastVisibleAt >= HIDE_THROTTLE_MS
  );
}

export function shouldReleaseIdle(
  session: GovernanceSession,
  now: number,
): boolean {
  return (
    session.visibleSurfaces <= 0 &&
    now - session.lastVisibleAt >= IDLE_RELEASE_MS
  );
}

/** Workspace ids to kill so at most `cap` warm sessions remain (LRU). */
export function workspacesOverWarmCap(
  sessions: GovernanceSession[],
  cap = WARM_SESSION_CAP,
): string[] {
  if (sessions.length <= cap) return [];
  const ordered = sessions
    .slice()
    .sort((a, b) => a.lastVisibleAt - b.lastVisibleAt);
  return ordered.slice(0, sessions.length - cap).map((s) => s.workspaceId);
}
