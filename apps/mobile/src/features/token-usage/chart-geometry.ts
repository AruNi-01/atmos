/** Room so the first x-axis label is not clipped by the pinned y-axis overlay. */
export const CHART_X_LABEL_INSET = 20;

export function scrollContentShift(axisWidth: number, inset: number = CHART_X_LABEL_INSET) {
  return Math.max(0, axisWidth - inset);
}

export function chartXFromGesture(
  eventX: number,
  offset: number,
  inset: number = CHART_X_LABEL_INSET,
) {
  return eventX + offset - inset;
}

export function firstAxisLabelFullyVisible(input: { inset: number; labelWidth: number }) {
  return input.inset >= input.labelWidth / 2;
}
