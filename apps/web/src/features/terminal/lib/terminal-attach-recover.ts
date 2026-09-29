/**
 * Attach failed because that tmux *window* is gone, while the workspace
 * session is still there.
 *
 * Only this case auto-recovers with create (same name; backend attach-if-exists).
 * `can't find session` must NOT recover: refresh/reload intentionally attaches
 * first and retries, so a lagging session is not mistaken for a missing one
 * and a second empty shell is not minted next to a live agent.
 */
export function isRecoverableTerminalAttachMiss(error: string): boolean {
  const text = error.toLowerCase();
  if (text.includes("can't find session") || text.includes("cannot find session")) {
    return false;
  }
  if (text.includes("tmux window with name") && text.includes("not found")) {
    return true;
  }
  if (text.includes("tmux window does not exist")) {
    return true;
  }
  return false;
}
