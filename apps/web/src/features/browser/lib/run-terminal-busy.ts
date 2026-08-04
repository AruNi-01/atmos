import { isPathLikeTitle } from "@atmos/shared/terminal";

/**
 * Map shell-shim dynamic titles to Run-panel busy state.
 *
 * - path-like titles come from `CMD_END:<cwd>` (idle at shell prompt)
 * - non-empty non-path titles come from `CMD_START:<command>` (foreground program)
 * - empty / unknown defaults to idle so Run stays available before attach
 */
export function isRunTerminalBusyFromTitle(title: string | undefined | null): boolean {
  const trimmed = title?.trim();
  if (!trimmed) return false;
  return !isPathLikeTitle(trimmed);
}
