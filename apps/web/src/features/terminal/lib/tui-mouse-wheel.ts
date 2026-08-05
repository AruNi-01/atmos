/**
 * Proportional TUI mouse-wheel reports (APP-054).
 *
 * When xterm mouse tracking is active, small trackpad/pixel wheel events often
 * produce zero or one mouse report. Convert vertical distance into a bounded
 * number of line-mode reports so fullscreen / inline TUIs scroll farther per
 * gesture. When tracking is off, callers must leave xterm's local scrollback alone.
 */

export const TUI_WHEEL_MAX_REPORTS_PER_EVENT = 12;
export const DEFAULT_TUI_WHEEL_CELL_HEIGHT = 16;

const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export type TuiWheelDistanceState = {
  pendingDirection: -1 | 0 | 1;
  pendingRows: number;
};

export type TuiWheelEventInput = {
  deltaY: number;
  deltaMode?: number;
};

export type TuiWheelMetrics = {
  cellHeight?: number;
  rows?: number;
};

export function createTuiWheelDistanceState(): TuiWheelDistanceState {
  return {
    pendingDirection: 0,
    pendingRows: 0,
  };
}

export function resolveTuiWheelDirection(event: Pick<TuiWheelEventInput, "deltaY">): -1 | 1 {
  return event.deltaY < 0 ? -1 : 1;
}

function normalizeCellHeight(cellHeight: number | undefined): number {
  if (typeof cellHeight === "number" && Number.isFinite(cellHeight) && cellHeight > 0) {
    return cellHeight;
  }
  return DEFAULT_TUI_WHEEL_CELL_HEIGHT;
}

/**
 * Convert a wheel event into row distance (absolute, fractional allowed).
 */
export function resolveTuiWheelDistanceRows(
  event: TuiWheelEventInput,
  metrics: TuiWheelMetrics = {},
): number {
  const deltaMode = event.deltaMode ?? DOM_DELTA_PIXEL;
  const absDelta = Math.abs(event.deltaY);
  if (!Number.isFinite(absDelta) || absDelta === 0) {
    return 0;
  }

  if (deltaMode === DOM_DELTA_LINE) {
    return absDelta;
  }
  if (deltaMode === DOM_DELTA_PAGE) {
    return absDelta * Math.max(1, metrics.rows ?? 1);
  }
  // Pixel mode: distance in terminal cells.
  return absDelta / normalizeCellHeight(metrics.cellHeight);
}

/**
 * How many line-mode wheel reports to emit for this event.
 * Accumulates fractional rows across events until a full row is owed.
 */
export function resolveTuiWheelReportCount(
  event: TuiWheelEventInput,
  state: TuiWheelDistanceState,
  metrics: TuiWheelMetrics = {},
): number {
  if (event.deltaY === 0 || !Number.isFinite(event.deltaY)) {
    return 0;
  }

  const direction = resolveTuiWheelDirection(event);
  if (state.pendingDirection !== 0 && state.pendingDirection !== direction) {
    state.pendingRows = 0;
  }
  state.pendingDirection = direction;

  const distanceRows = resolveTuiWheelDistanceRows(event, metrics);
  if (distanceRows <= 0) {
    return 0;
  }

  // Discrete line wheels: at least one report per notch.
  const deltaMode = event.deltaMode ?? DOM_DELTA_PIXEL;
  const rows =
    deltaMode === DOM_DELTA_LINE
      ? Math.max(1, distanceRows)
      : distanceRows;

  const total = state.pendingRows + rows;
  const reports = Math.min(TUI_WHEEL_MAX_REPORTS_PER_EVENT, Math.trunc(total));
  state.pendingRows = total - reports;
  // Cap residual so a long pixel stream cannot store huge debt.
  if (state.pendingRows > TUI_WHEEL_MAX_REPORTS_PER_EVENT) {
    state.pendingRows = state.pendingRows % 1;
  }
  return reports;
}

export type TuiWheelTerminalLike = {
  attachCustomWheelEventHandler: (handler: (event: WheelEvent) => boolean) => void;
  element: HTMLElement | undefined;
  rows: number;
  modes: { mouseTrackingMode: "none" | "x10" | "vt200" | "drag" | "any" };
};

const REPLAYED_WHEEL_PROPERTY = "__atmosReplayedTuiWheel";

type ReplayedWheelEvent = WheelEvent & {
  [REPLAYED_WHEEL_PROPERTY]?: boolean;
};

function isReplayedWheelEvent(event: WheelEvent): boolean {
  return (event as ReplayedWheelEvent)[REPLAYED_WHEEL_PROPERTY] === true;
}

function markReplayedWheelEvent(event: WheelEvent): void {
  Object.defineProperty(event, REPLAYED_WHEEL_PROPERTY, {
    configurable: true,
    value: true,
  });
}

function resolveCellHeight(terminal: TuiWheelTerminalLike): number | undefined {
  const screen = terminal.element?.querySelector?.(".xterm-screen") as HTMLElement | null | undefined;
  const rect = screen?.getBoundingClientRect?.();
  if (!rect || rect.height <= 0 || terminal.rows <= 0) {
    return undefined;
  }
  return rect.height / terminal.rows;
}

function cloneLineWheelEvent(event: WheelEvent): WheelEvent {
  const clone = new WheelEvent(event.type, {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed,
    view: event.view,
    detail: event.detail,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
    relatedTarget: event.relatedTarget,
    deltaX: 0,
    deltaY: event.deltaY < 0 ? -1 : 1,
    deltaZ: 0,
    deltaMode: DOM_DELTA_LINE,
  });
  markReplayedWheelEvent(clone);
  return clone;
}

export type AttachTuiMouseWheelOptions = {
  /** Fired when mouse-tracking active state may have changed (for UI chrome). */
  onMouseTrackingActiveChange?: (active: boolean) => void;
};

/**
 * Attach proportional multi-report wheel handling while mouse tracking is on.
 * Returns true from the handler when xterm should use default behavior.
 */
export function attachTuiMouseWheelMultiplier(
  terminal: TuiWheelTerminalLike,
  options: AttachTuiMouseWheelOptions = {},
): void {
  const distanceState = createTuiWheelDistanceState();
  let pendingReports = 0;
  let pendingEvent: WheelEvent | null = null;
  let pendingTarget: EventTarget | null = null;
  let drainScheduled = false;
  let lastActive: boolean | null = null;

  const publishActive = () => {
    const active = terminal.modes.mouseTrackingMode !== "none";
    if (lastActive === active) return;
    lastActive = active;
    options.onMouseTrackingActiveChange?.(active);
  };

  const drain = () => {
    drainScheduled = false;
    const target = pendingTarget;
    const event = pendingEvent;
    const count = pendingReports;
    pendingTarget = null;
    pendingEvent = null;
    pendingReports = 0;
    if (!target || !event || count <= 0) {
      return;
    }
    if (terminal.modes.mouseTrackingMode === "none") {
      publishActive();
      return;
    }
    for (let i = 0; i < count; i += 1) {
      target.dispatchEvent(cloneLineWheelEvent(event));
    }
  };

  terminal.attachCustomWheelEventHandler((event) => {
    publishActive();
    if (isReplayedWheelEvent(event)) {
      return true;
    }
    if (terminal.modes.mouseTrackingMode === "none") {
      return true;
    }
    if (event.deltaY === 0 || event.shiftKey) {
      return true;
    }

    const reportCount = resolveTuiWheelReportCount(
      event,
      distanceState,
      {
        cellHeight: resolveCellHeight(terminal),
        rows: terminal.rows,
      },
    );

    if (reportCount <= 0) {
      // Consume tiny pixel motion while tracking (avoid local scroll bleed).
      return false;
    }

    const target =
      event.currentTarget instanceof EventTarget ? event.currentTarget : terminal.element;
    if (!target) {
      return true;
    }

    pendingReports += reportCount;
    if (pendingReports > TUI_WHEEL_MAX_REPORTS_PER_EVENT * 2) {
      pendingReports = TUI_WHEEL_MAX_REPORTS_PER_EVENT * 2;
    }
    pendingEvent = event;
    pendingTarget = target;
    if (!drainScheduled) {
      drainScheduled = true;
      queueMicrotask(drain);
    }
    // Suppress the original event; replays become the reports.
    return false;
  });

  // Initial sync (e.g. after hydrate restores mouse modes).
  publishActive();
}

/** Whether the terminal currently reports mouse to the application. */
export function isTerminalMouseTrackingActive(
  terminal: Pick<TuiWheelTerminalLike, "modes"> & {
    element?: HTMLElement | undefined;
  },
): boolean {
  if (terminal.modes.mouseTrackingMode !== "none") {
    return true;
  }
  return Boolean(terminal.element?.classList.contains("enable-mouse-events"));
}

/**
 * Whether **real shell** title CMD_END (OSC 9999) should clear TUI mouse.
 *
 * Fullscreen TUIs stay on the alternate buffer — never wipe there.
 * Reattach inject uses OSC 9998 and must not call this path at all (APP-054).
 */
export function shouldDisableTuiMouseOnCmdEnd(bufferActiveType: string | undefined): boolean {
  return bufferActiveType !== "alternate";
}
