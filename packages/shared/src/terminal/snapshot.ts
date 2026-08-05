import type { TerminalSnapshot } from "./protocol";

// DECSET mouse modes (xterm.js maps these to exclusive protocols; last wins):
// 1000 VT200 click, 1002 cell-motion/drag, 1003 any-motion (hover), 1006 SGR.
// 1003 is required for TUI hover popovers / row highlight; omit it and click
// still works but mousemove reports are dropped (DRAG protocol only).
export const ENABLE_TUI_MOUSE_TRACKING = "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h";
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
  "alternate" | "restore_mouse_tracking" | "mouse_tracking_sequence"
>): boolean {
  if (typeof snapshot.mouse_tracking_sequence === "string" && snapshot.mouse_tracking_sequence.length > 0) {
    return true;
  }
  // Fullscreen TUIs always need mouse after reattach even if a stale
  // restore_mouse_tracking=false was persisted (inactive observation lag).
  if (snapshot.alternate === true) {
    return true;
  }
  if (typeof snapshot.restore_mouse_tracking === "boolean") {
    return snapshot.restore_mouse_tracking;
  }
  return false;
}

/** Exact or default DECSET sequence for post-hydrate mouse restore. */
export function mouseTrackingRestoreSequence(snapshot: Pick<
  TerminalSnapshot,
  "alternate" | "restore_mouse_tracking" | "mouse_tracking_sequence"
>): string {
  if (typeof snapshot.mouse_tracking_sequence === "string" && snapshot.mouse_tracking_sequence.length > 0) {
    return snapshot.mouse_tracking_sequence;
  }
  return shouldRestoreTuiMouseTracking(snapshot) ? ENABLE_TUI_MOUSE_TRACKING : "";
}

export function buildTerminalSnapshotRestorePayload(snapshot: TerminalSnapshot): {
  payload: string;
  useAlternateScreen: boolean;
  restoreMouseTracking: boolean;
} {
  const useAlternateScreen = snapshot.alternate === true;
  const mouseRestore = mouseTrackingRestoreSequence(snapshot);
  const restoreMouseTracking = mouseRestore.length > 0;
  const screenMode = useAlternateScreen ? "\x1b[?1049h" : "\x1b[?1049l";
  const clearScrollback = useAlternateScreen ? "" : "\x1b[3J";
  const clearScreen = `${screenMode}\x1b[H\x1b[2J${clearScrollback}`;
  const data = normalizeSnapshotData(snapshot.data);
  const cursorRestore = `\x1b[${snapshot.cursor_y + 1};${snapshot.cursor_x + 1}H`;

  return {
    payload: `${clearScreen}\x1b[?7l${data}\x1b[?7h\x1b[0m${cursorRestore}${mouseRestore}`,
    useAlternateScreen,
    restoreMouseTracking,
  };
}

