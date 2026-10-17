/** `user-message-meta.css`: cubic-bezier(0.22, 1, 0.36, 1). */
export const USER_META_EASE = [0.22, 1, 0.36, 1] as const;

/** Closed meta items sit 5px above their row. */
export const USER_META_LIFT_PX = 5;

/** Open grows for 280ms. Close shrinks for 200ms after a 50ms delay. */
export function userMetaHeightMotion(open: boolean): { delay: number; duration: number } {
  return open ? { delay: 0, duration: 280 } : { delay: 50, duration: 200 };
}

/**
 * Open items fade over 220ms and move over 280ms, staggered 30ms then 70ms.
 * Close uses the resting 140ms / 180ms transition with no stagger.
 */
export function userMetaItemMotion(
  open: boolean,
  index: number,
): { delay: number; opacityMs: number; translateMs: number } {
  if (!open) return { delay: 0, opacityMs: 140, translateMs: 180 };
  return {
    delay: index <= 0 ? 30 : 70,
    opacityMs: 220,
    translateMs: 280,
  };
}
