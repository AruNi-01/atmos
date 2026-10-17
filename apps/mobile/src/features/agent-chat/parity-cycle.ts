import { PARITY_FIXTURE_IDS } from "@atmos/agent-transcript";
import { parityMotionKind } from "./parity-motion-fixtures";

export const PARITY_THEMES = ["light", "dark"] as const;

/** Long enough that a stalled `simctl io screenshot` still lands on this frame.
 * Run 38816093468 blocked for 61s while the 15s hold had already moved on. */
export const PARITY_HOLD_MS = 90_000;

/** One 15s timeout completed every frame on run 38816093468. A single 90s
 * timeout stopped before F7 (run 38823255381). Sub-second ticks never reached
 * F2 (run 38831101582). Repeat the interval that worked, and change frames
 * when wall time says the hold is over. */
const PARITY_STEP_MS = 15_000;

export type ParityTheme = (typeof PARITY_THEMES)[number];

export type ParityFrame = {
  id: string;
  theme: ParityTheme;
};

/** Light F1–F13, then dark F1–F13. One pass. */
export function parityCycleFrames(): ParityFrame[] {
  const frames: ParityFrame[] = [];
  for (const theme of PARITY_THEMES) {
    for (const id of PARITY_FIXTURE_IDS) {
      frames.push({ id, theme });
    }
  }
  return frames;
}

/**
 * Device-log evidence for one frame.
 * `seq` is the index in `parityCycleFrames()` (0 for a pinned query).
 */
export function parityReadyLine(frame: ParityFrame, seq: number): string {
  return `[parity] ready ${frame.id} ${frame.theme} #${seq}`;
}

/** A fixture query pins one frame and disables the carousel. */
export function parityPinnedFrame(fixture: string, theme: string): ParityFrame | null {
  const id = fixture.trim();
  if (!id) return null;
  return { id, theme: theme.trim() === "dark" ? "dark" : "light" };
}

/** Written into the app Documents directory before each iOS capture launch. */
export const PARITY_FRAME_FILE = "parity-frame.json";

/** A Documents pin must name a real fixture. A bad file falls through to the carousel. */
export function parseParityDiskFrame(raw: string): ParityFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as { id?: unknown; theme?: unknown };
  if (typeof record.id !== "string") return null;
  const id = record.id.trim();
  if (!(PARITY_FIXTURE_IDS as readonly string[]).includes(id) && !parityMotionKind(id)) return null;
  if (record.theme !== "light" && record.theme !== "dark") return null;
  return { id, theme: record.theme };
}

export type ParityClock = {
  index: () => number;
  subscribe: (listener: (index: number) => void) => () => void;
  /** First caller for a token logs the ready line. Later callers are the other mounted route. */
  claim: (token: string) => boolean;
  /** One hold for the process. A second mounted preview must not start its own. */
  arm: (frameCount: number) => boolean;
  reset: () => void;
};

/**
 * Cold start mounts preview-chat twice (initial route, then the redirect).
 * Independent timers reach the light→dark boundary apart and write opposite
 * theme preferences from `useLayoutEffect` until React aborts.
 */
export function createParityClock(
  holdMs: number,
  schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (id: ReturnType<typeof setTimeout>) => void = clearTimeout,
  now: () => number = Date.now,
): ParityClock {
  let index = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let claimed = "";
  const listeners = new Set<(index: number) => void>();

  return {
    index: () => index,
    subscribe(listener) {
      listeners.add(listener);
      listener(index);
      return () => listeners.delete(listener);
    },
    claim(token) {
      if (claimed === token) return false;
      claimed = token;
      return true;
    },
    arm(frameCount) {
      if (timer != null || index >= frameCount - 1) return false;
      const startedAt = now();
      const tick = () => {
        timer = null;
        if (index >= frameCount - 1) return;
        if (now() - startedAt >= holdMs) {
          index += 1;
          for (const listener of listeners) listener(index);
          return;
        }
        const remaining = holdMs - (now() - startedAt);
        timer = schedule(tick, Math.min(PARITY_STEP_MS, remaining));
      };
      timer = schedule(tick, Math.min(PARITY_STEP_MS, holdMs));
      return true;
    },
    reset() {
      if (timer != null) cancel(timer);
      timer = null;
      index = 0;
      claimed = "";
      listeners.clear();
    },
  };
}

const parityClock = createParityClock(PARITY_HOLD_MS);

export function parityClockIndex(): number {
  return parityClock.index();
}

export function subscribeParityClock(listener: (index: number) => void): () => void {
  return parityClock.subscribe(listener);
}

export function claimParityReady(token: string): boolean {
  return parityClock.claim(token);
}

export function armParityClock(frameCount: number): boolean {
  return parityClock.arm(frameCount);
}
