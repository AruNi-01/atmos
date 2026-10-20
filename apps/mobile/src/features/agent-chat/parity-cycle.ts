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
  /** Capture-only. The manual `f13-tail` link leaves this unset and stays at the end. */
  scroll?: "away";
  /** Capture-only. Forces chat motion off. The manual link leaves this unset. */
  motion?: "reduced";
  /** Capture-only. Replays the fixture script. The manual link leaves this unset. */
  replay?: "script";
  /** Capture-only. Steps the pill handler. The manual link leaves this unset. */
  lane?: "steps";
  /** Capture-only. After the tail hold, calls the scroll pill handler. The manual link leaves this unset. */
  pill?: "return";
  /** Capture-only. Steps the composer. The manual link leaves this unset. */
  composer?: "states";
  /** Capture-only. Mounts the F12 card lane on a tail frame. The manual link leaves this unset. */
  cards?: "lane";
  /**
   * Capture-only clock. When set, replay, lane, and composer stay on this
   * script time instead of running from the wall clock. A slow screenshot can
   * then land on that step.
   */
  atMs?: number;
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
export function parityPinnedFrame(
  fixture: string,
  theme: string,
  motion?: string,
  replay?: string,
  lane?: string,
  pill?: string,
  composer?: string,
): ParityFrame | null {
  const id = fixture.trim();
  if (!id) return null;
  const frame: ParityFrame = { id, theme: theme.trim() === "dark" ? "dark" : "light" };
  if (motion?.trim() === "reduced") frame.motion = "reduced";
  if (replay?.trim() === "script") frame.replay = "script";
  if (lane?.trim() === "steps") frame.lane = "steps";
  if (pill?.trim() === "return") frame.pill = "return";
  if (composer?.trim() === "states") frame.composer = "states";
  return frame;
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
  const record = value as {
    id?: unknown;
    lane?: unknown;
    motion?: unknown;
    atMs?: unknown;
    composer?: unknown;
    cards?: unknown;
    pill?: unknown;
    replay?: unknown;
    scroll?: unknown;
    theme?: unknown;
  };
  if (typeof record.id !== "string") return null;
  const id = record.id.trim();
  if (!(PARITY_FIXTURE_IDS as readonly string[]).includes(id) && !parityMotionKind(id)) return null;
  if (record.theme !== "light" && record.theme !== "dark") return null;
  const frame: ParityFrame = { id, theme: record.theme };
  if (record.scroll === "away") frame.scroll = "away";
  if (record.motion === "reduced") frame.motion = "reduced";
  if (record.replay === "script") frame.replay = "script";
  if (record.lane === "steps") frame.lane = "steps";
  if (record.pill === "return") frame.pill = "return";
  if (record.composer === "states") frame.composer = "states";
  if (record.cards === "lane") frame.cards = "lane";
  if (typeof record.atMs === "number" && Number.isFinite(record.atMs) && record.atMs >= 0) {
    frame.atMs = record.atMs;
  }
  return frame;
}

export type ParityClock = {
  index: () => number;
  subscribe: (listener: (index: number) => void) => () => void;
  /** First caller for a token logs the ready line. Later callers are the other mounted route. */
  claim: (token: string) => boolean;
  /** One hold for the process. A second mounted preview must not start its own. */
  arm: (frameCount: number) => boolean;
  /** Latest focused preview. An earlier route must not scroll or log the tail. */
  takeOwner: () => number;
  owner: () => number;
  /** Cached. `useSyncExternalStore` relies on the same reference until the owner changes. */
  tailSnapshot: () => TailOwnerSnapshot;
  bindMount: (mountId: string, generation: number) => void;
  subscribeOwner: (listener: () => void) => () => void;
  releaseOwner: (generation: number) => void;
  reset: () => void;
};

export type TailOwnerSnapshot = {
  owner: number;
  byMount: Readonly<Record<string, number>>;
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
  let nextOwner = 0;
  let mounts: Record<string, number> = {};
  let tailSnapshot: TailOwnerSnapshot = { owner: 0, byMount: mounts };
  const ownerStack: number[] = [];
  const listeners = new Set<(index: number) => void>();
  const ownerListeners = new Set<() => void>();

  const currentOwner = () => ownerStack.at(-1) ?? 0;
  const publishOwner = () => {
    tailSnapshot = { owner: currentOwner(), byMount: mounts };
    for (const listener of ownerListeners) listener();
  };

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
    takeOwner() {
      nextOwner += 1;
      ownerStack.push(nextOwner);
      publishOwner();
      return nextOwner;
    },
    owner: currentOwner,
    tailSnapshot: () => tailSnapshot,
    bindMount(mountId, generation) {
      if (generation === 0) {
        if (mounts[mountId] == null) return;
        const next = { ...mounts };
        delete next[mountId];
        mounts = next;
      } else {
        mounts = { ...mounts, [mountId]: generation };
      }
      publishOwner();
    },
    subscribeOwner(listener) {
      ownerListeners.add(listener);
      return () => ownerListeners.delete(listener);
    },
    releaseOwner(generation) {
      const indexInStack = ownerStack.lastIndexOf(generation);
      if (indexInStack < 0) return;
      const previous = currentOwner();
      ownerStack.splice(indexInStack, 1);
      if (currentOwner() !== previous) publishOwner();
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
      nextOwner = 0;
      ownerStack.length = 0;
      mounts = {};
      tailSnapshot = { owner: 0, byMount: mounts };
      listeners.clear();
      ownerListeners.clear();
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

export function takeParityOwner(): number {
  return parityClock.takeOwner();
}

export function parityOwner(): number {
  return parityClock.owner();
}

export function parityTailSnapshot(): TailOwnerSnapshot {
  return parityClock.tailSnapshot();
}

export function bindParityTailMount(mountId: string, generation: number): void {
  parityClock.bindMount(mountId, generation);
}

export function parityOwnerIs(generation: number): boolean {
  return generation !== 0 && parityClock.owner() === generation;
}

/** The focused mount whose generation is the current owner may scroll and log. */
export function parityTailOwned(
  focused: boolean,
  mountId: string,
  snapshot: TailOwnerSnapshot,
): boolean {
  return focused && snapshot.owner !== 0 && snapshot.byMount[mountId] === snapshot.owner;
}

export function subscribeParityOwner(listener: () => void): () => void {
  return parityClock.subscribeOwner(listener);
}

export function releaseParityOwner(generation: number): void {
  parityClock.releaseOwner(generation);
}
