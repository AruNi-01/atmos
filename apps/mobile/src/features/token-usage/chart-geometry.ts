/**
 * Chart-kit x labels use `textAnchor: "middle"` at the data-point x.
 * The y-axis overlay must not cover this band, or the leftmost month is
 * clipped to `"No"` / `"eb"`. Matches chart-kit `xLabelBaselineOffset` (20)
 * plus the axis font.
 */
export const CHART_X_LABEL_BAND = 28;

/** Half-width of a typical 3-letter month label at the axis font. */
export const CHART_X_LABEL_HALF = 12;

export function overlayPlotHeight(chartHeight: number, labelBand: number = CHART_X_LABEL_BAND) {
  return Math.max(0, chartHeight - labelBand);
}

/**
 * Centered x-label at the first plot x is fully visible when the overlay
 * leaves the label band open so the glyph can extend into the y-axis gutter.
 */
export function firstAxisLabelFullyVisible(input: {
  anchorX: number;
  axisWidth: number;
  labelHalf: number;
  overlayCoversLabelBand: boolean;
}) {
  if (input.overlayCoversLabelBand) {
    return input.anchorX - input.labelHalf >= input.axisWidth;
  }
  return input.anchorX - input.labelHalf >= 0;
}

export function chartXFromGesture(eventX: number, offset: number) {
  return eventX + offset;
}

/** Max x offset for a full-width chart ScrollView. Do not add a label inset. */
export function scrollEndOffset(contentWidth: number, viewport: number) {
  return Math.max(0, contentWidth - viewport);
}
