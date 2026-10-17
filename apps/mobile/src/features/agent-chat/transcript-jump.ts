import { TRANSCRIPT_END_SLACK_PX } from "@atmos/agent-transcript";

/** Short one-line rows. Used only when nothing has been measured yet. */
export const TRANSCRIPT_JUMP_FALLBACK_STRIDE = 48;

/**
 * A jump that never leaves the end follows the tail only when its target is
 * the last row. An earlier row stays unstuck even while the list is still
 * clamped to the end, so a short tail can grow under that reading line.
 */
export function jumpFollowsTailAfterMiss(targetIndex: number, rowCount: number): boolean {
  return rowCount <= 0 || targetIndex >= rowCount - 1;
}

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

export type TranscriptJumpMeasurement = {
  size: number;
  start?: number;
};

/**
 * Row layout for a jump that has to scroll past the measured tail.
 * Measured rows keep their real origin. An unmeasured row continues from the
 * nearest measured neighbor. Neighbors below the target are estimated
 * backward: placing them after the anchor scrolls past Reply 50.
 */
export function transcriptItemLayout(
  index: number,
  measurements: ReadonlyArray<TranscriptJumpMeasurement | undefined>,
  gap: number,
  fallbackStride = TRANSCRIPT_JUMP_FALLBACK_STRIDE,
): { index: number; length: number; offset: number } {
  const safeIndex = Math.max(0, Math.floor(index));
  const safeGap = Math.max(0, gap);
  let count = 0;
  let size = 0;
  let prevIndex = -1;
  let nextIndex = -1;
  for (let i = 0; i < measurements.length; i += 1) {
    const measurement = measurements[i];
    if (!measurement || !(measurement.size > 0) || measurement.start == null) continue;
    count += 1;
    size += measurement.size;
    if (i <= safeIndex) prevIndex = i;
    else if (nextIndex < 0) nextIndex = i;
  }
  const average = count > 0 ? size / count : fallbackStride;
  const stride = average + safeGap;
  const measured = measurements[safeIndex];
  if (measured && measured.size > 0 && measured.start != null) {
    return {
      index: safeIndex,
      length: Math.max(1, Math.round(measured.size)),
      offset: Math.max(0, Math.round(measured.start)),
    };
  }
  if (prevIndex >= 0) {
    const prev = measurements[prevIndex];
    const offset =
      (prev?.start ?? 0) +
      (prev?.size ?? 0) +
      safeGap +
      Math.max(0, safeIndex - prevIndex - 1) * stride;
    return {
      index: safeIndex,
      length: Math.max(1, Math.round(average)),
      offset: Math.max(0, Math.round(offset)),
    };
  }
  if (nextIndex >= 0) {
    const next = measurements[nextIndex];
    const offset = (next?.start ?? 0) - (nextIndex - safeIndex) * stride;
    return {
      index: safeIndex,
      length: Math.max(1, Math.round(average)),
      offset: Math.max(0, Math.round(offset)),
    };
  }
  return {
    index: safeIndex,
    length: fallbackStride,
    offset: safeIndex * fallbackStride,
  };
}

/**
 * Offset that puts a measured jump target at the top of the viewport.
 * Null means the list is already there, or the target has no origin yet.
 */
export function jumpAlignOffset(
  scrollTop: number,
  targetStart: number | null | undefined,
  alignSlack = 2,
): number | null {
  if (targetStart == null || !(targetStart >= 0)) return null;
  if (Math.abs(scrollTop - targetStart) <= alignSlack) return null;
  return targetStart;
}

/**
 * True when measured rows below the target already fill the viewport plus the
 * end slack. The estimated tail can come off without clamping the jump back
 * to the end.
 */
export function jumpHasTailRoom(
  targetIndex: number,
  measurements: ReadonlyArray<{ size: number } | undefined>,
  viewport: number,
  gap: number,
  slack = TRANSCRIPT_END_SLACK_PX,
): boolean {
  if (viewport <= 0 || targetIndex < 0) return false;
  const target = measurements[targetIndex];
  if (!target || !(target.size > 0)) return false;
  const safeGap = Math.max(0, gap);
  const need = viewport + slack + safeGap + 1;
  let below = 0;
  for (let i = targetIndex + 1; i < measurements.length; i += 1) {
    const measurement = measurements[i];
    if (!measurement || !(measurement.size > 0)) break;
    below += measurement.size + safeGap;
    if (below >= need) return true;
  }
  return false;
}

/**
 * The estimated tail stays until the viewport is on the target row.
 * Turning that layout on can drop the offset to the top. Releasing it
 * there collapses the content and clamps the list.
 */
export function jumpExtendReadyToRelease(
  targetIndex: number,
  measurements: ReadonlyArray<TranscriptJumpMeasurement | undefined>,
  viewport: number,
  gap: number,
  scrollTop: number,
  alignSlack = 2,
): boolean {
  if (!jumpHasTailRoom(targetIndex, measurements, viewport, gap)) return false;
  const target = measurements[targetIndex];
  if (!target || target.start == null || !(target.size > 0)) return false;
  return Math.abs(scrollTop - target.start) <= alignSlack;
}
