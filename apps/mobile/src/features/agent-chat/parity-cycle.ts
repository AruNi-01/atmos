import { PARITY_FIXTURE_IDS } from "@atmos/agent-transcript";

export const PARITY_THEMES = ["light", "dark"] as const;

/** Long enough for the capture script to screenshot after the ready line. */
export const PARITY_HOLD_MS = 15_000;

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
      timer = schedule(() => {
        timer = null;
        index += 1;
        for (const listener of listeners) listener(index);
      }, holdMs);
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
