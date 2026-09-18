/** Per 60fps frame, keep this fraction of remaining scroll/invert error. ~230ms to settle. */
export const OWN_SEND_GLIDE_RETAIN = 0.85;
export const OWN_SEND_GLIDE_DONE_PX = 0.5;
/** Later sends pin below the title/header; the first row uses 0 so it is not double-padded. */
export const OWN_SEND_TOP_INSET = 10;

export type OwnSendKind = "first" | "follow";

export function ownSendTopInset(kind: OwnSendKind): number {
  return kind === "first" ? 0 : OWN_SEND_TOP_INSET;
}

/** First send always docks; later sends only pin when the user is already following the tail. */
export function shouldRunOwnSendPin(kind: OwnSendKind, following: boolean): boolean {
  return kind === "first" || following;
}

/** Visible room under a prompt that is pinned to the top inset. */
export function ownSendViewportRoom(
  viewportHeight: number,
  promptHeight: number,
  inset = 0,
): number {
  return Math.max(0, viewportHeight - Math.max(0, promptHeight) - inset);
}

/**
 * Extra spacer under the prompt so pinning it to the top is still the scroll
 * end — no leftover page below, so the jump-to-bottom control stays hidden.
 */
export function ownSendRunwayPx(
  viewportHeight: number,
  promptHeight: number,
  inset = 0,
  occupiedBelowPx = 0,
): number {
  return Math.max(
    0,
    Math.round(ownSendViewportRoom(viewportHeight, promptHeight, inset) - occupiedBelowPx),
  );
}

/**
 * First send: the prompt is already laid out at the top of the transcript.
 * Invert it down to the bottom of the viewport (just above the composer) so the
 * play-out can carry it up while the composer docks.
 */
export function firstSendInvertPx(
  viewportHeight: number,
  promptHeight: number,
  inset = 0,
): number {
  return ownSendViewportRoom(viewportHeight, promptHeight, inset);
}

export function ownSendPinScrollTop(
  promptOffset: number,
  inset: number,
  maxScroll: number,
): number {
  const top = Math.max(0, promptOffset - inset);
  return Math.min(top, Math.max(0, maxScroll));
}

export function stepOwnSendGlide(
  current: number,
  target: number,
  retain = OWN_SEND_GLIDE_RETAIN,
): number {
  const next = target + (current - target) * retain;
  if (Math.abs(next - target) < OWN_SEND_GLIDE_DONE_PX) return target;
  return next;
}

export function ownSendGlideDone(current: number, target: number): boolean {
  return Math.abs(current - target) < OWN_SEND_GLIDE_DONE_PX;
}

/** Real content under the prompt has filled the pinned viewport. */
export function ownSendRunwayOverflowed(
  occupiedBelowPx: number,
  viewportHeight: number,
  promptHeight: number,
  inset = 0,
): boolean {
  return occupiedBelowPx >= ownSendViewportRoom(viewportHeight, promptHeight, inset) - 1;
}
