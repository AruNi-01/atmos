/**
 * VS Code-style terminal resize:
 * - Rows are cheap → apply immediately.
 * - Cols trigger full-buffer reflow → debounce (~100ms).
 * - Small buffers skip the debounce so first paint / short shells stay snappy.
 *
 * PTY / SIGWINCH is a separate concern (see host-resize-pin).
 */

export const TERMINAL_RESIZE_COL_DEBOUNCE_MS = 100;
export const TERMINAL_RESIZE_SMALL_BUFFER = 200;

export type TerminalGridSize = { cols: number; rows: number };

export type TerminalResizeDebouncer = {
  resize: (size: TerminalGridSize, immediate?: boolean) => void;
  flush: () => void;
  cancel: () => void;
};

export function createTerminalResizeDebouncer(options: {
  apply: (size: TerminalGridSize) => void;
  applyRows?: (rows: number) => void;
  getBufferLength?: () => number;
  debounceMs?: number;
  scheduleTimeout?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}): TerminalResizeDebouncer {
  const debounceMs = options.debounceMs ?? TERMINAL_RESIZE_COL_DEBOUNCE_MS;
  const scheduleTimeout = options.scheduleTimeout ?? setTimeout;
  const clearScheduled = options.clearTimeout ?? clearTimeout;

  let latest: TerminalGridSize | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer == null) return;
    clearScheduled(timer);
    timer = null;
  };

  const applyLatest = () => {
    timer = null;
    if (!latest) return;
    options.apply(latest);
  };

  return {
    resize(size, immediate) {
      latest = size;
      if (immediate) {
        clearTimer();
        options.apply(size);
        return;
      }
      // Rows are cheap; cols reflow the whole scrollback. Match VS Code:
      // apply height now, coalesce width so wrap does not run every pointermove.
      options.applyRows?.(size.rows);
      clearTimer();
      timer = scheduleTimeout(applyLatest, debounceMs);
    },
    flush() {
      if (!latest) {
        clearTimer();
        return;
      }
      clearTimer();
      options.apply(latest);
    },
    cancel() {
      clearTimer();
      latest = null;
    },
  };
}
