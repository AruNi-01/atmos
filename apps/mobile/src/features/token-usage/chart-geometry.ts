/**
 * Plot x-labels are drawn by us, not chart-kit. iOS UIView clips overflow, so a
 * centred first month at x=0 becomes `"n"`. Growth uses a dummy y-label pad so
 * the first point sits far enough right; bar labels sit on the bar centre.
 */
export const CHART_X_LABEL_BAND = 28;
export const CHART_X_LABEL_FONT = 11;
/** Fallback width for a 3-letter month. iOS is wider than chart-kit's 0.56em. */
export const MONTH_LABEL_WIDTH = 24;
export const X_LABEL_CHAR = 0.7;
export const X_LABEL_MIN_GAP = 6;

/** Half-width of a typical 3-letter month label at the axis font. */
export const CHART_X_LABEL_HALF = MONTH_LABEL_WIDTH / 2;

/**
 * Chart-kit `calculateAutoPadding` base.left when y labels take no width.
 * Growth and bar plots sit beside the y-axis column.
 */
export const CHART_PLOT_BASE_LEFT = 10;
/** Chart-kit auto-padding gap between a non-zero y-label width and the plot. */
export const CHART_Y_LABEL_GAP = 8;
/**
 * Dummy `yAxisLabelWidth` on the growth plot. Forces plot.x past half a month
 * so a centred first label is not clipped at the iOS UIView edge.
 */
export const GROWTH_Y_LABEL_PAD = 4;
export const BAR_KIT_RIGHT = 14;
export const BAR_PADDING_INNER = 0.12;
export const BAR_PADDING_OUTER = 0.08;
export const BAR_BAND = 1 - BAR_PADDING_INNER;

export type XLabelAlign = "start" | "middle";

/** Chart-kit plot.x for a numeric `yAxisLabelWidth`. */
export function chartKitPlotLeft(yAxisLabelWidth: number = 0) {
  return CHART_PLOT_BASE_LEFT + (yAxisLabelWidth > 0 ? yAxisLabelWidth + CHART_Y_LABEL_GAP : 0);
}

export const GROWTH_PLOT_LEFT = chartKitPlotLeft(GROWTH_Y_LABEL_PAD);

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
  plotLeft: number = GROWTH_PLOT_LEFT,
  plotRight: number = 18,
) {
  if (count <= 1) return plotWidth;
  return Math.max(plotWidth, plotLeft + (count - 1) * gap + plotRight);
}

export function growthSliceWidth(
  count: number,
  gap: number,
  plotLeft: number = GROWTH_PLOT_LEFT,
  plotRight: number = 18,
) {
  if (count <= 1) return plotLeft + plotRight;
  return plotLeft + (count - 1) * gap + plotRight;
}

/** Actual x step of growth points for a laid-out content width. */
export function growthPointStep(
  count: number,
  contentWidth: number,
  plotLeft: number = GROWTH_PLOT_LEFT,
  plotRight: number = 18,
) {
  if (count <= 1) return 0;
  return (contentWidth - plotLeft - plotRight) / (count - 1);
}

/** Content x of a growth point. Index 0 is the first month. */
export function growthPointX(index: number, plotLeft: number, step: number) {
  return plotLeft + index * step;
}

/** Host x of a growth point when the y-axis column is beside the plot. */
export function growthPointHostX(input: {
  axisWidth: number;
  index: number;
  offset: number;
  plotLeft: number;
  step: number;
}) {
  return input.axisWidth + growthPointX(input.index, input.plotLeft, input.step) - input.offset;
}

/**
 * First growth label is centred when the point is far enough from x=0; otherwise
 * it starts on the point so iOS cannot clip the left half.
 */
export function growthLabelAlign(
  index: number,
  plotLeft: number = GROWTH_PLOT_LEFT,
  labelWidth: number = MONTH_LABEL_WIDTH,
): XLabelAlign {
  if (index !== 0) return "middle";
  return plotLeft >= labelWidth / 2 ? "middle" : "start";
}

export function xLabelWidth(text: string) {
  return Math.max(MONTH_LABEL_WIDTH, Math.ceil(text.length * CHART_X_LABEL_FONT * X_LABEL_CHAR));
}

export function xLabelFrame(
  anchorX: number,
  align: XLabelAlign,
  labelWidth: number = MONTH_LABEL_WIDTH,
) {
  const left = align === "start" ? anchorX : anchorX - labelWidth / 2;
  return { align, anchorX, left, right: left + labelWidth, width: labelWidth };
}

export function xLabelFullyVisible(left: number, clipLeft: number = 0) {
  return left >= clipLeft;
}

export function firstGrowthLabelFullyVisible(input: {
  align: XLabelAlign;
  clipLeft: number;
  hostX: number;
  labelWidth: number;
}) {
  const frame = xLabelFrame(input.hostX, input.align, input.labelWidth);
  return xLabelFullyVisible(frame.left, input.clipLeft);
}

/**
 * Centered x-label at the first plot x is fully visible when the overlay
 * leaves the label band open and the slice is not cropped at the plot origin.
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

/** Band centre = bar centre. Labels use this for every index, including 0. */
export function barCenterX(index: number, plotLeft: number, slot: number) {
  const bandX = plotLeft + slot * (BAR_PADDING_OUTER + index);
  return bandX + (slot * BAR_BAND) / 2;
}

export function barLabelX(index: number, plotLeft: number, slot: number) {
  return barCenterX(index, plotLeft, slot);
}

export function barLabelAlign(): XLabelAlign {
  return "middle";
}

export function barPlotSpan(count: number, slot: number) {
  return slot * (Math.max(count, 1) - BAR_PADDING_INNER + BAR_PADDING_OUTER * 2);
}

export function barContentWidth(
  plotWidth: number,
  count: number,
  slot: number,
  plotLeft: number = CHART_PLOT_BASE_LEFT,
  plotRight: number = BAR_KIT_RIGHT,
) {
  if (count <= 1) return plotWidth;
  return Math.max(plotWidth, plotLeft + barPlotSpan(count, slot) + plotRight);
}

export function barSliceWidth(
  count: number,
  slot: number,
  plotLeft: number = CHART_PLOT_BASE_LEFT,
  plotRight: number = BAR_KIT_RIGHT,
) {
  return plotLeft + barPlotSpan(count, slot) + plotRight;
}

/** Band step chart-kit uses for `contentWidth`. Equals `slot` when the strip is longer than the plot. */
export function barBandStep(
  count: number,
  contentWidth: number,
  plotLeft: number = CHART_PLOT_BASE_LEFT,
  plotRight: number = BAR_KIT_RIGHT,
) {
  const span = Math.max(1, contentWidth - plotLeft - plotRight);
  const denominator = Math.max(1, Math.max(count, 1) - BAR_PADDING_INNER + BAR_PADDING_OUTER * 2);
  return span / denominator;
}

export function visibleXLabelIndexes(input: {
  alignAt: (index: number) => XLabelAlign;
  count: number;
  minGap?: number;
  widthAt: (index: number) => number;
  xAt: (index: number) => number;
}) {
  const minGap = input.minGap ?? X_LABEL_MIN_GAP;
  const indexes: number[] = [];
  let lastRight = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < input.count; index += 1) {
    const frame = xLabelFrame(input.xAt(index), input.alignAt(index), input.widthAt(index));
    if (index > 0 && frame.left < lastRight + minGap) continue;
    indexes.push(index);
    lastRight = frame.right;
  }
  return indexes;
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

/** Max x offset for a plot ScrollView. Do not add a label inset. */
export function scrollEndOffset(contentWidth: number, viewport: number) {
  return Math.max(0, contentWidth - viewport);
}

/**
 * Scroll offset used to place chart slices. A rubber-band overscroll is visual
 * only; chasing it would shift the drawn window while the plot springs back.
 */
export function settledScrollOffset(offset: number, limit: number) {
  const max = Number.isFinite(limit) ? Math.max(0, limit) : 0;
  if (!Number.isFinite(offset)) return 0;
  return Math.min(max, Math.max(0, offset));
}
