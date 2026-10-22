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
 * Centered x-label at the first plot x is fully visible when:
 * - the y-axis overlay leaves the label band open, and
 * - the windowed slice is not cropped at the plot origin (`marginLeft: -axis`).
 * Cropping at the plot origin clips `"Nov"` / `"Feb"` to `"No"` / `"eb"` even
 * when the overlay is short, because iOS clips the slice wrapper.
 */
export function firstAxisLabelFullyVisible(input: {
  anchorX: number;
  axisWidth: number;
  labelHalf: number;
  overlayCoversLabelBand: boolean;
  plotCroppedAtAxis?: boolean;
}) {
  const left = input.anchorX - input.labelHalf;
  if (input.plotCroppedAtAxis || input.overlayCoversLabelBand) {
    return left >= input.axisWidth;
  }
  return left >= 0;
}

/** Content origin of a windowed slice. Keep the y-axis column in the slice. */
export function windowedSliceFrame(spanStart: number, step: number, drawnWidth: number) {
  return {
    left: spanStart * step,
    width: drawnWidth,
  };
}

export function chartXFromGesture(eventX: number, offset: number) {
  return eventX + offset;
}

/** Max x offset for a full-width chart ScrollView. Do not add a label inset. */
export function scrollEndOffset(contentWidth: number, viewport: number) {
  return Math.max(0, contentWidth - viewport);
}
