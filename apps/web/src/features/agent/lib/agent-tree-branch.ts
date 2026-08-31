export const TREE_BRANCH_MID_Y = 12;
export const TREE_BRANCH_RADIUS = 6;
export const TREE_BRANCH_ARM = 10;
export const TREE_BRANCH_FIRST_START_Y = -4;
export const TREE_BRANCH_WIDTH = TREE_BRANCH_RADIUS + TREE_BRANCH_ARM;

export const TREE_CLIP_VERTICAL_ONLY = `inset(0 ${TREE_BRANCH_WIDTH - 1}px 100% 0)`;
export const TREE_CLIP_VERTICAL_FULL = `inset(0 ${TREE_BRANCH_WIDTH - 1}px 0 0)`;
export const TREE_CLIP_FULL = "inset(0 0 0 0)";

export const TREE_LINE_MS = 280;
export const TREE_TRUNK_MS = 220;
export const TREE_START_MS = 40;
export const TREE_STEP_MS = 90;
export const TREE_CONTENT_DELAY_MS = 70;
export const TREE_TITLE_STAGGER_MS = 15;
export const TREE_TITLE_SEGMENT_MS = 300;
export const TREE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

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

export function nextTreeRevealDelay(shown: number, pending: number): number {
  if (shown <= 0) return TREE_START_MS;
  if (pending > 16) return 24;
  if (pending > 8) return 50;
  return TREE_STEP_MS;
}
