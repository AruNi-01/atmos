import {
  AGENT_CHAT_OVERLAY_PAD_SHRINK_EASING,
  AGENT_CHAT_OVERLAY_PAD_SHRINK_MS,
  transcriptBottomPadPx,
} from "@atmos/agent-transcript";

export const TRANSCRIPT_PAD_SHRINK_MS = AGENT_CHAT_OVERLAY_PAD_SHRINK_MS;

/** `Easing.bezier` arguments for the shared overlay shrink curve. */
export const TRANSCRIPT_PAD_SHRINK_BEZIER = [0.22, 1, 0.36, 1] as const;

export function transcriptPadShrinkEasing(): string {
  return `cubic-bezier(${TRANSCRIPT_PAD_SHRINK_BEZIER.join(", ")})`;
}

/** List bottom padding: base 40 plus the expanded card and the pill row. */
export function transcriptListBottomPad(expandedCardHeight: number, pillRowHeight: number): number {
  const overlay = Math.max(0, expandedCardHeight) + Math.max(0, pillRowHeight);
  return transcriptBottomPadPx(overlay);
}

export function resolvedPillRowHeight(rowRendered: boolean, measuredHeight: number): number {
  return rowRendered ? Math.max(0, measuredHeight) : 0;
}

/** Shrink eases for 350ms. Growth and reduced motion snap. */
export function transcriptPadShouldEase(
  previousPx: number,
  nextPx: number,
  reducedMotion: boolean,
): boolean {
  return nextPx < previousPx && !reducedMotion;
}

export function transcriptPadEasingMatchesShared(): boolean {
  return transcriptPadShrinkEasing() === AGENT_CHAT_OVERLAY_PAD_SHRINK_EASING;
}
