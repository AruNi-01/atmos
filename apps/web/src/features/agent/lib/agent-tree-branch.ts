export const TREE_BRANCH_MID_Y = 12;
export const TREE_BRANCH_RADIUS = 6;
export const TREE_BRANCH_ARM = 10;
export const TREE_BRANCH_FIRST_START_Y = -4;
export const TREE_BRANCH_WIDTH = TREE_BRANCH_RADIUS + TREE_BRANCH_ARM;

export const TREE_CLIP_VERTICAL_ONLY = `inset(0 ${TREE_BRANCH_WIDTH - 1}px 100% 0)`;
export const TREE_CLIP_VERTICAL_FULL = `inset(0 ${TREE_BRANCH_WIDTH - 1}px 0 0)`;
export const TREE_CLIP_FULL = "inset(0 0 0 0)";

export const TREE_LINE_MS = 300;
export const TREE_TRUNK_MS = 300;
export const TREE_START_MS = 40;
export const TREE_STEP_MS = 90;
export const TREE_CONTENT_DELAY_MS = 70;
export const TREE_TITLE_STAGGER_MS = 15;
export const TREE_TITLE_SEGMENT_MS = 300;
export const TREE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
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
  return TREE_LINE_MS;
}

export function countedRevealDelay(shown: number, target: number, stepMs: number): number | null {
  if (shown === target) return null;
  if (shown === 0 && target > shown) return 16;
  return stepMs;
}
