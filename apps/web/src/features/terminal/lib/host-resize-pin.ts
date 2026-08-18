/** Host chrome is dragging a split / sidebar / mosaic divider. */
export const HOST_RESIZE_DRAG_ATTR = "data-atmos-drag-active";

/** Max PTY / TUI SIGWINCH rate while a host resize drag is live. */
export const HOST_RESIZE_PIN_INTERVAL_MS = 80;

export type TerminalGridSize = { cols: number; rows: number };

export type HostResizePinScheduler = {
  schedule: (size: TerminalGridSize) => void;
  flush: () => void;
  cancel: () => void;
  dispose: () => void;
};

export function isHostResizeDragActive(
  root: { hasAttribute: (name: string) => boolean } | null | undefined =
    typeof document === "undefined" ? null : document.documentElement,
): boolean {
  return Boolean(root?.hasAttribute(HOST_RESIZE_DRAG_ATTR));
}

/**
 * CSI 3J on every xterm resize flashes inline TUIs. Skip it while the user is
 * dragging a host splitter; flush once when the drag attribute drops.
 */
export function shouldDiscardXtermScrollbackOnResize(input: {
  inlineMouseTuiActive: boolean;
  hostResizeDragActive: boolean;
}): boolean {
  return input.inlineMouseTuiActive && !input.hostResizeDragActive;
}

type ScheduleTimeout = (
  fn: () => void,
  ms: number,
) => ReturnType<typeof setTimeout>;

/**
 * Leading + trailing throttle for `terminal_resize`.
 * During a host drag the first new grid goes out immediately, then at most
 * once per {@link HOST_RESIZE_PIN_INTERVAL_MS}, then `flush()` on pointerup.
 */
export function createHostResizePinScheduler(options: {
  send: (size: TerminalGridSize) => void;
  isDragActive?: () => boolean;
  intervalMs?: number;
  now?: () => number;
  scheduleTimeout?: ScheduleTimeout;
  clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}): HostResizePinScheduler {
  const intervalMs = options.intervalMs ?? HOST_RESIZE_PIN_INTERVAL_MS;
  const isDragActive = options.isDragActive ?? isHostResizeDragActive;
  const now = options.now ?? Date.now;
  const scheduleTimeout = options.scheduleTimeout ?? setTimeout;
  const clearScheduled = options.clearTimeout ?? clearTimeout;

  let lastSentAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: TerminalGridSize | null = null;

  const sendNow = (size: TerminalGridSize) => {
    pending = null;
    lastSentAt = now();
    options.send(size);
  };

  const clearTimer = () => {
    if (timer == null) return;
    clearScheduled(timer);
    timer = null;
  };

  const schedule = (size: TerminalGridSize) => {
    if (!isDragActive()) {
      clearTimer();
      sendNow(size);
      return;
    }

    pending = size;
    const elapsed = now() - lastSentAt;
    if (elapsed >= intervalMs) {
      clearTimer();
      sendNow(size);
      return;
    }
    if (timer != null) return;
    timer = scheduleTimeout(() => {
      timer = null;
      if (pending) sendNow(pending);
    }, intervalMs - elapsed);
  };

  const flush = () => {
    clearTimer();
    if (pending) sendNow(pending);
  };

  const cancel = () => {
    clearTimer();
    pending = null;
  };

  return {
    schedule,
    flush,
    cancel,
    dispose: cancel,
  };
}
