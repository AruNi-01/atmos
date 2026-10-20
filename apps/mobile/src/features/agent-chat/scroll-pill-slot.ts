/** The scroll pill fades, and its pinned slot width, over this long. Reduced Motion snaps. */
export const SCROLL_PILL_SLOT_MS = 180;

/** Space between the scroll pill and the card pills. It lives inside the slot so the cards slide with it. */
export const SCROLL_PILL_SLOT_GAP = 8;

/** Open slot width. A hidden pill takes no width, so the card pills sit at the row's left padding. */
export function scrollPillSlotWidth(pillWidth: number): number {
  if (pillWidth <= 0) return 0;
  return pillWidth + SCROLL_PILL_SLOT_GAP;
}
