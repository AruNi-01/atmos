import { isInlineMouseTuiScrollbackSurface } from "@/features/terminal/lib/tui-mouse-wheel";

/** Host chrome is dragging a split / sidebar / mosaic divider. */
export const HOST_RESIZE_DRAG_ATTR = "data-atmos-drag-active";

/** Max PTY / TUI SIGWINCH rate while a host resize drag is live. */
export const HOST_RESIZE_PIN_INTERVAL_MS = 80;

export type TerminalGridSize = { cols: number; rows: number };

export type HostResizeSurfaceKind = "shell" | "inline-tui" | "alt-screen";

export type HostResizePinScheduler = {
  /** Leading + trailing throttle — interactive TUIs that must SIGWINCH live. */
  schedule: (size: TerminalGridSize) => void;
  /** Trailing debounce — window resize of an idle shell. */
  debounce: (size: TerminalGridSize) => void;
  /** Remember size only; send on {@link HostResizePinScheduler.flush}. */
  hold: (size: TerminalGridSize) => void;
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

type MouseTrackingMode = "none" | "x10" | "vt200" | "drag" | "any";

function asMouseTrackingMode(value: string | undefined): MouseTrackingMode {
  if (
    value === "x10" ||
    value === "vt200" ||
    value === "drag" ||
    value === "any"
  ) {
    return value;
  }
  return "none";
}

export function hostResizeSurfaceKind(term: {
  buffer: { active: { type: string } };
  modes?: { mouseTrackingMode?: string };
  element?: HTMLElement;
} | null | undefined): HostResizeSurfaceKind {
  if (!term) return "shell";
  if (term.buffer.active.type === "alternate") return "alt-screen";
  if (
    isInlineMouseTuiScrollbackSurface({
      buffer: term.buffer,
      modes: { mouseTrackingMode: asMouseTrackingMode(term.modes?.mouseTrackingMode) },
      element: term.element,
    })
  ) {
    return "inline-tui";
  }
  return "shell";
}

/**
 * Idle shells must not SIGWINCH (or incrementally reflow) on every splitter
 * move: tmux `refresh-client` re-dumps the pane and xterm cannot invert many
 * wide-glyph wraps. Preview-scale the bitmap; pin once when the drag ends.
 */
export function shouldPinPtyDuringHostDrag(kind: HostResizeSurfaceKind): boolean {
  return kind !== "shell";
}

/**
 * Inline mouse TUIs paint a new full frame on SIGWINCH. Always drop the
 * previous frame from local history when we apply a resize, including during
 * a host drag — otherwise the old frame stays as stacked remnants.
 */
export function shouldDiscardXtermScrollbackOnResize(input: {
  inlineMouseTuiActive: boolean;
}): boolean {
  return input.inlineMouseTuiActive;
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

  const debounce = (size: TerminalGridSize) => {
    pending = size;
    clearTimer();
    timer = scheduleTimeout(() => {
      timer = null;
      if (pending) sendNow(pending);
    }, intervalMs);
  };

  const hold = (size: TerminalGridSize) => {
    pending = size;
    clearTimer();
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
    debounce,
    hold,
    flush,
    cancel,
    dispose: cancel,
  };
}
