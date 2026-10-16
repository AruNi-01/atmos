import { TRANSCRIPT_END_SLACK_PX } from "@atmos/agent-transcript";

/** Short one-line rows. Used only when nothing has been measured yet. */
export const TRANSCRIPT_JUMP_FALLBACK_STRIDE = 48;

/**
 * A programmatic jump away from the end must not be undone by a scroll event
 * that still reports the old end position. The caller keeps `jumping` set
 * until the user drags or an explicit scroll-to-end runs. Past the slack, the
 * jump counts as a drag so the list lets go of the end.
 */
export function stickScrollWhileJumping(
  distance: number,
  jumping: boolean,
  userDragged: boolean,
): { distance: number; userDragged: boolean } | "ignore" {
  if (!jumping) return { distance, userDragged };
  if (distance <= TRANSCRIPT_END_SLACK_PX) return "ignore";
  return { distance, userDragged: true };
}

/**
 * Approximate content offset for a row the list has not laid out.
 * Measured rows set the stride. The fallback stays short so a long list of
 * one-line rows is not clamped back to the end.
 */
export function offsetFromMeasuredStride(
  index: number,
  measurements: ReadonlyArray<{ size: number } | undefined>,
  gap: number,
  fallbackStride = TRANSCRIPT_JUMP_FALLBACK_STRIDE,
): number {
  let count = 0;
  let size = 0;
  for (const measurement of measurements) {
    if (!measurement || !(measurement.size > 0)) continue;
    count += 1;
    size += measurement.size;
  }
  const stride = count > 0 ? size / count + Math.max(0, gap) : fallbackStride;
  return Math.max(0, Math.round(Math.max(0, index) * stride));
}
