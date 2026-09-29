export const OBSERVER_WIRE_MS = 240;

/** cubic-bezier(0.5, 0, 0.1, 1) — wire travel while a card moves or changes height. */
const WIRE_EASE: readonly [number, number, number, number] = [0.5, 0, 0.1, 1];

export type WirePoint = { x: number; y: number };

export type ObserverWireFrame = {
  positions: Map<string, WirePoint>;
  boxHeights: Map<string, number>;
};

export type ObserverWireBaseline = {
  positions: Map<string, WirePoint>;
  heights: Map<string, number>;
};

export type ObserverWireMotion = {
  fromPositions: Map<string, WirePoint>;
  toPositions: Map<string, WirePoint>;
  fromHeights: Map<string, number>;
  toHeights: Map<string, number>;
  start: number;
  duration: number;
};

export function observerWireEase(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const [x1, y1, x2, y2] = WIRE_EASE;
  return sampleCubicBezier(x1, y1, x2, y2, t);
}

export function observerWirePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}

export function layoutMotionKey(
  positions: Map<string, WirePoint>,
  heights: Map<string, number>,
): string {
  return [...positions.keys()]
    .sort()
    .map((id) => {
      const point = positions.get(id)!;
      const height = heights.get(id);
      return `${id}:${Math.round(point.x * 100)},${Math.round(point.y * 100)},${height == null ? "" : Math.round(height)}`;
    })
    .join("|");
}

export function beginObserverWireMotion({
  current,
  targets,
  heights,
  reduced,
  now,
}: {
  current: ObserverWireBaseline | null;
  targets: Map<string, WirePoint>;
  heights: Map<string, number>;
  reduced: boolean;
  now: number;
}): ObserverWireMotion {
  const snap = (): ObserverWireMotion => ({
    fromPositions: targets,
    toPositions: targets,
    fromHeights: heights,
    toHeights: heights,
    start: now,
    duration: 0,
  });
  if (!current || reduced) return snap();

  let sameIds = current.positions.size === targets.size;
  let moved = false;
  if (sameIds) {
    for (const [id, to] of targets) {
      const from = current.positions.get(id);
      if (!from) {
        sameIds = false;
        break;
      }
      if (Math.abs(from.x - to.x) >= 0.5 || Math.abs(from.y - to.y) >= 0.5)
        moved = true;
    }
  }

  let hadBaseline = false;
  let heightChanged = false;
  for (const id of targets.keys()) {
    const nextHeight = heights.get(id);
    const prevHeight = current.heights.get(id);
    if (prevHeight != null) hadBaseline = true;
    if (
      prevHeight != null &&
      nextHeight != null &&
      Math.abs(prevHeight - nextHeight) >= 1
    ) {
      heightChanged = true;
    }
  }

  if (sameIds && !hadBaseline) return snap();
  if (!moved && !heightChanged && sameIds) return snap();

  const fromPositions = new Map<string, WirePoint>();
  const fromHeights = new Map<string, number>();
  const toHeights = new Map<string, number>();
  for (const [id, to] of targets) {
    fromPositions.set(id, current.positions.get(id) ?? to);
    const nextHeight = heights.get(id);
    if (nextHeight == null) continue;
    toHeights.set(id, nextHeight);
    fromHeights.set(id, current.heights.get(id) ?? nextHeight);
  }
  return {
    fromPositions,
    toPositions: targets,
    fromHeights,
    toHeights,
    start: now,
    duration: OBSERVER_WIRE_MS,
  };
}

export function sampleObserverWireMotion(
  motion: ObserverWireMotion,
  now: number,
): { frame: ObserverWireFrame; baseline: ObserverWireBaseline } {
  const t =
    motion.duration <= 0
      ? 1
      : Math.min(1, Math.max(0, (now - motion.start) / motion.duration));
  const eased = t >= 1 ? 1 : observerWireEase(t);
  const positions = new Map<string, WirePoint>();
  const boxHeights = new Map<string, number>();
  const heights = new Map<string, number>();
  for (const [id, to] of motion.toPositions) {
    const from = motion.fromPositions.get(id) ?? to;
    positions.set(
      id,
      eased >= 1
        ? to
        : {
            x: from.x + (to.x - from.x) * eased,
            y: from.y + (to.y - from.y) * eased,
          },
    );
    const toHeight = motion.toHeights.get(id);
    if (toHeight == null) continue;
    const fromHeight = motion.fromHeights.get(id) ?? toHeight;
    if (eased < 1 && Math.abs(fromHeight - toHeight) >= 1) {
      const height = fromHeight + (toHeight - fromHeight) * eased;
      boxHeights.set(id, height);
      heights.set(id, height);
    } else {
      heights.set(id, toHeight);
    }
  }
  return { frame: { positions, boxHeights }, baseline: { positions, heights } };
}

function sampleCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
): number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sample = (t: number, a: number, b: number, c: number) =>
    ((a * t + b) * t + c) * t;
  const slope = (t: number, a: number, b: number, c: number) =>
    (3 * a * t + 2 * b) * t + c;
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const dx = sample(t, ax, bx, cx) - x;
    if (Math.abs(dx) < 1e-5) break;
    const derivative = slope(t, ax, bx, cx);
    if (Math.abs(derivative) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - dx / derivative));
  }
  return sample(t, ay, by, cy);
}
