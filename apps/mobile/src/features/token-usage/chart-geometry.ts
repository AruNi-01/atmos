/**
 * Chart-kit x labels use `textAnchor: "middle"` at the data-point x.
 * The y-axis overlay must not cover this band, or the leftmost month is
 * clipped to `"No"` / `"eb"`. Matches chart-kit `xLabelBaselineOffset` (20)
 * plus the axis font.
 */
export const CHART_X_LABEL_BAND = 28;

/** Half-width of a typical 3-letter month label at the axis font. */
export const CHART_X_LABEL_HALF = 12;

/**
 * Chart-kit `calculateAutoPadding` base.left when `yAxisLabelWidth` is 0.
 * Growth plots use this instead of the y-axis column, which sits beside the
 * scroll view so Nov/Dec cannot land in the gutter left of January.
 */
export const CHART_PLOT_BASE_LEFT = 10;

export function overlayPlotHeight(chartHeight: number, labelBand: number = CHART_X_LABEL_BAND) {
  return Math.max(0, chartHeight - labelBand);
}

export function growthPlotWidth(hostWidth: number, axisWidth: number) {
  return Math.max(0, hostWidth - axisWidth);
}

export function growthContentWidth(
  plotWidth: number,
  count: number,
  gap: number,
  plotLeft: number = CHART_PLOT_BASE_LEFT,
  plotRight: number = 18,
) {
  if (count <= 1) return plotWidth;
  return Math.max(plotWidth, plotLeft + (count - 1) * gap + plotRight);
}

export function growthSliceWidth(
  count: number,
  gap: number,
  plotLeft: number = CHART_PLOT_BASE_LEFT,
  plotRight: number = 18,
) {
  if (count <= 1) return plotLeft + plotRight;
  return plotLeft + (count - 1) * gap + plotRight;
}

/** Host x of a growth point when the y-axis column is beside the plot. */
export function growthPointHostX(input: {
  axisWidth: number;
  index: number;
  offset: number;
  plotLeft: number;
  step: number;
}) {
  return input.axisWidth + input.plotLeft + input.index * input.step - input.offset;
}

/**
 * A centred growth label sits on its point and is fully readable when the
 * y-axis is a sibling column (not an overlay) and labels are not edge-shifted.
 */
export function firstGrowthLabelFullyVisible(input: {
  axisWidth: number;
  edgeLabelPolicy: "shift" | "show";
  hostX: number;
  labelHalf: number;
  overlayGutter: boolean;
}) {
  if (input.overlayGutter || input.edgeLabelPolicy === "shift") return false;
  return input.hostX - input.labelHalf >= input.axisWidth;
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
