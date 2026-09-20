export const TREE_BRANCH_MID_Y = 12;
export const TREE_BRANCH_RADIUS = 6;
export const TREE_BRANCH_ARM = 10;
export const TREE_BRANCH_TRUNK_X = 8;
export const TREE_BRANCH_FIRST_START_Y = 0;
export const TREE_BRANCH_END_X = TREE_BRANCH_TRUNK_X + TREE_BRANCH_RADIUS + TREE_BRANCH_ARM;
export const TREE_BRANCH_WIDTH = TREE_BRANCH_RADIUS + TREE_BRANCH_ARM;
export const TREE_BRANCH_GUTTER = 28;
export const TREE_LINE_WIDTH = 1.5;
/**
 * `--border` is translucent, and a tangent fork always overlaps its trunk.
 * Paint opaque ink and fade the whole group once, or every joint composites
 * twice and reads brighter than the line around it. Matches `--border`'s alpha.
 */
export const TREE_LINE_ALPHA = 0.1;

/** Stroke draw — same window as the BranchedMenu reference. */
export const TREE_DRAW_MS = 400;
export const TREE_LINE_MS = TREE_DRAW_MS;
export const TREE_TRUNK_MS = TREE_DRAW_MS;
export const TREE_START_MS = 40;
/** Gap between overlapping stroke starts. Each stroke still lasts TREE_DRAW_MS. */
export const TREE_STEP_MS = 56;
/** Longest a whole batch may spend starting. Long groups compress the step instead. */
export const TREE_STAGGER_CAP_MS = 560;
export const TREE_CONTENT_DELAY_MS = 70;
export const TREE_TITLE_STAGGER_MS = 15;
export const TREE_TITLE_SEGMENT_MS = 300;
export const TREE_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
export const TREE_REVEAL_BLUR = "blur(6px)";
export const TREE_REVEAL_LIFT = "translateY(4px)";
export const TREE_REVEAL_FADE_PX = 22;
export const WEBSEARCH_EXPAND_MS = 300;
export const WEBSEARCH_STEP_MS = 120;
export const WEBSEARCH_EXPAND_EASE = [0.22, 1, 0.36, 1] as const;

export function treeTitleRevealMs(charCount: number): number {
  return TREE_CONTENT_DELAY_MS + Math.max(charCount, 1) * TREE_TITLE_STAGGER_MS + TREE_TITLE_SEGMENT_MS;
}

export function shouldPlayTreeTitleEnter(
  treeReveal: boolean,
  shimmer: boolean,
  alreadyShown: boolean,
): boolean {
  return treeReveal && !shimmer && !alreadyShown;
}

export function nextTreeRevealDelay(shown: number, _pending: number): number {
  if (shown <= 0) return TREE_START_MS;
  return TREE_STEP_MS;
}

/** Closed (or reduced-motion) groups treat every current row as already seen. */
export function nextTreeWatermark(watermark: number, count: number, active: boolean): number {
  if (!active) return count;
  return Math.min(watermark, count);
}

export function clampTreeShown(
  shown: number,
  count: number,
  watermark: number,
  active: boolean,
): number {
  if (!active) return count;
  return Math.min(Math.max(shown, watermark), count);
}

export function countedRevealDelay(shown: number, target: number, stepMs: number): number | null {
  if (shown === target) return null;
  if (shown === 0 && target > shown) return 16;
  return stepMs;
}

export function treeElbowRadius(midY: number, fromY: number, radius = TREE_BRANCH_RADIUS): number {
  return Math.min(radius, Math.max(0, midY - fromY - 2));
}

/** Vertical drop from `fromY`, rounded elbow, then arm to the row. */
export function treeReachPath(
  fromY: number,
  midY: number,
  trunkX = TREE_BRANCH_TRUNK_X,
  radius = TREE_BRANCH_RADIUS,
  endX = TREE_BRANCH_END_X,
): string {
  const r = treeElbowRadius(midY, fromY, radius);
  return `M ${trunkX} ${fromY} V ${midY - r} A ${r} ${r} 0 0 0 ${trunkX + r} ${midY} H ${endX}`;
}

export function treeReachLength(
  fromY: number,
  midY: number,
  trunkX = TREE_BRANCH_TRUNK_X,
  radius = TREE_BRANCH_RADIUS,
  endX = TREE_BRANCH_END_X,
): number {
  const r = treeElbowRadius(midY, fromY, radius);
  return Math.max(0, midY - r - fromY) + (Math.PI * r) / 2 + Math.max(0, endX - trunkX - r);
}

export function treeTrunkPath(
  fromY: number,
  toY: number,
  trunkX = TREE_BRANCH_TRUNK_X,
): string {
  if (toY <= fromY) return `M ${trunkX} ${fromY}`;
  return `M ${trunkX} ${fromY} V ${toY}`;
}

/** Start offset between overlapping strokes. The stroke itself always lasts TREE_DRAW_MS. */
export function treeSegmentDelayMs(index: number, stepMs = TREE_STEP_MS): number {
  if (index <= 0) return 0;
  return index * stepMs;
}

/** Same overlap, but a long group tightens the step so the batch stays under the cap. */
export function treeStaggerDelayMs(
  index: number,
  count: number,
  stepMs = TREE_STEP_MS,
): number {
  if (index <= 0 || count <= 1) return 0;
  return index * Math.min(stepMs, TREE_STAGGER_CAP_MS / (count - 1));
}

/**
 * A batch that appears in one frame (expand / parallel dump) staggers starts.
 * Rows that append one-by-one start immediately — sequential reveal already spaced them.
 */
export function treeEnterDelayMs(
  index: number,
  previousCount: number,
  nextCount: number,
  stepMs = TREE_STEP_MS,
): number {
  if (index < previousCount) return 0;
  const batch = previousCount === 0 && nextCount > 1;
  if (!batch) return 0;
  return treeStaggerDelayMs(index, nextCount, stepMs);
}
