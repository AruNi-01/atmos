/**
 * Wait until the proposed grid stops changing before applying a fit.
 *
 * ResizeObserver + splitter pointermove fire every frame. Fitting on each
 * tick SIGWINCHes the shell (full prompt redraw) and, with WebGL, resets the
 * canvas. Wait one unchanged frame (or a small frame cap) so wrapping updates
 * without a resize storm. Direct PTY terminals only redraw the last prompt
 * line after a single SIGWINCH; we match that cadence.
 */

export const TERMINAL_STABLE_FIT_MAX_FRAMES = 8;

export type TerminalGridSize = { cols: number; rows: number };

export type StableGridScheduler = {
  request: () => void;
  flush: () => void;
  cancel: () => void;
};

export function gridSizesEqual(
  a: TerminalGridSize | null | undefined,
  b: TerminalGridSize | null | undefined,
): boolean {
  return Boolean(a && b && a.cols === b.cols && a.rows === b.rows);
}

export function createStableGridScheduler(options: {
  measure: () => TerminalGridSize | null;
  isCurrent: (size: TerminalGridSize) => boolean;
  apply: (size: TerminalGridSize) => void;
  maxFrames?: number;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
}): StableGridScheduler {
  const maxFrames = options.maxFrames ?? TERMINAL_STABLE_FIT_MAX_FRAMES;
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;

  let handle = 0;
  let previous: TerminalGridSize | null = null;
  let frameCount = 0;

  const stop = () => {
    if (handle) {
      cancelFrame(handle);
      handle = 0;
    }
    previous = null;
    frameCount = 0;
  };

  const applyAndStop = (size: TerminalGridSize) => {
    stop();
    if (!options.isCurrent(size)) {
      options.apply(size);
    }
  };

  const tick = () => {
    handle = 0;
    const next = options.measure();
    frameCount += 1;
    if (!next) {
      stop();
      return;
    }
    if (options.isCurrent(next) || gridSizesEqual(previous, next)) {
      applyAndStop(next);
      return;
    }
    previous = next;
    if (frameCount >= maxFrames) {
      applyAndStop(next);
      return;
    }
    handle = requestFrame(tick);
  };

  return {
    request() {
      if (handle) return;
      previous = options.measure();
      frameCount = 0;
      handle = requestFrame(tick);
    },
    flush() {
      const next = options.measure() ?? previous;
      stop();
      if (next && !options.isCurrent(next)) {
        options.apply(next);
      }
    },
    cancel: stop,
  };
}
