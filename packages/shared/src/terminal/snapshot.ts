import type { TerminalSnapshot } from "./protocol";

export const ENABLE_TUI_MOUSE_TRACKING = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
export const DISABLE_TUI_MOUSE_TRACKING = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l";

const MIN_TERMINAL_COLS = 20;
const MIN_TERMINAL_ROWS = 8;

export function normalizeSnapshotData(data: string): string {
  return data.replace(/\r?\n/g, "\r\n");
}

export function isUsableTerminalGrid(cols: number, rows: number): boolean {
  return cols >= MIN_TERMINAL_COLS && rows >= MIN_TERMINAL_ROWS;
}

export function isTerminalSnapshot(value: unknown): value is TerminalSnapshot {
  if (value == null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.data === "string" &&
    typeof record.cursor_x === "number" &&
    typeof record.cursor_y === "number" &&
    typeof record.cols === "number" &&
    typeof record.rows === "number" &&
    typeof record.alternate === "boolean"
  );
}

/**
 * Basename of a pane command (handles absolute paths).
 * Matches backend `pane_command_basename`.
 */
export function paneCommandBasename(cmd: string): string {
  const trimmed = cmd.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

/**
 * Inline mouse TUIs that enable mouse reporting without alt-screen.
 * Keep in sync with core-engine `is_inline_mouse_tui_command`.
 *
 * Grok installs as a versioned binary (`grok-0.2.103-macos-aarch64`); tmux
 * `pane_current_command` reports that name (sometimes truncated), not `grok`.
 */
export function isInlineMouseTuiCommand(cmd: string): boolean {
  const name = paneCommandBasename(cmd);
  return name === "grok" || name.startsWith("grok-");
}

/** Whether reattach hydration should re-enable xterm mouse tracking modes. */
export function shouldRestoreTuiMouseTracking(snapshot: Pick<
  TerminalSnapshot,
  "alternate" | "restore_mouse_tracking"
>): boolean {
  if (typeof snapshot.restore_mouse_tracking === "boolean") {
    return snapshot.restore_mouse_tracking;
  }
  // Older backends only set `alternate`; keep that heuristic as fallback.
  return snapshot.alternate === true;
}

export function buildTerminalSnapshotRestorePayload(snapshot: TerminalSnapshot): {
  payload: string;
  useAlternateScreen: boolean;
  restoreMouseTracking: boolean;
} {
  const useAlternateScreen = snapshot.alternate === true;
  const restoreMouseTracking = shouldRestoreTuiMouseTracking(snapshot);
  const screenMode = useAlternateScreen ? "\x1b[?1049h" : "\x1b[?1049l";
  const clearScrollback = useAlternateScreen ? "" : "\x1b[3J";
  const clearScreen = `${screenMode}\x1b[H\x1b[2J${clearScrollback}`;
  const data = normalizeSnapshotData(snapshot.data);
  const cursorRestore = `\x1b[${snapshot.cursor_y + 1};${snapshot.cursor_x + 1}H`;
  const mouseRestore = restoreMouseTracking ? ENABLE_TUI_MOUSE_TRACKING : "";

  return {
    payload: `${clearScreen}\x1b[?7l${data}\x1b[?7h\x1b[0m${cursorRestore}${mouseRestore}`,
    useAlternateScreen,
    restoreMouseTracking,
  };
}

