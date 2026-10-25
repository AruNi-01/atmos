// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  BAR_BAND,
  BAR_PADDING_OUTER,
  CHART_PLOT_BASE_LEFT,
  CHART_X_LABEL_BAND,
  CHART_X_LABEL_HALF,
  GROWTH_PLOT_LEFT,
  GROWTH_Y_LABEL_PAD,
  MONTH_LABEL_WIDTH,
  barBandStep,
  barCenterX,
  barContentWidth,
  barLabelAlign,
  barLabelX,
  barSliceWidth,
  chartKitPlotLeft,
  chartXFromGesture,
  firstAxisLabelFullyVisible,
  firstGrowthLabelFullyVisible,
  growthContentWidth,
  growthLabelAlign,
  growthPlotWidth,
  growthPointHostX,
  growthPointStep,
  growthPointX,
  growthSliceWidth,
  overlayPlotHeight,
  scrollEndOffset,
  settledScrollOffset,
  visibleXLabelIndexes,
  windowedSliceFrame,
  xLabelFrame,
  xLabelFullyVisible,
  xLabelWidth,
} from "./chart-geometry";

describe("chart x-axis label band", () => {
  test("the y-axis overlay leaves the x-label row open", () => {
    expect(CHART_X_LABEL_BAND).toBe(28);
    expect(overlayPlotHeight(220)).toBe(192);
    expect(
      firstAxisLabelFullyVisible({
        anchorX: 66,
        axisWidth: 66,
        labelHalf: CHART_X_LABEL_HALF,
        overlayCoversLabelBand: false,
      }),
    ).toBe(true);
    expect(
      firstAxisLabelFullyVisible({
        anchorX: 66,
        axisWidth: 66,
        labelHalf: CHART_X_LABEL_HALF,
        overlayCoversLabelBand: true,
      }),
    ).toBe(false);
  });

  test("cropping the slice at the plot origin clips Nov/Feb even when the overlay is short", () => {
    expect(
      firstAxisLabelFullyVisible({
        anchorX: 66,
        axisWidth: 66,
        labelHalf: CHART_X_LABEL_HALF,
        overlayCoversLabelBand: false,
        plotCroppedAtAxis: true,
      }),
    ).toBe(false);
  });

  test("a windowed slice keeps the y-axis column so a centered first label is not at x=0", () => {
    expect(windowedSliceFrame(0, 32, 400)).toEqual({ left: 0, width: 400 });
    expect(windowedSliceFrame(3, 32, 280)).toEqual({ left: 96, width: 280 });
  });

  test("gesture chartX is host x plus scroll offset", () => {
    const axisWidth = 66;
    expect(chartXFromGesture(axisWidth, 0)).toBe(axisWidth);
    expect(chartXFromGesture(axisWidth, 12)).toBe(axisWidth + 12);
  });

  test("end placement does not add a label inset that undoes the first point", () => {
    const viewport = 400;
    const contentWidth = 500;
    expect(scrollEndOffset(contentWidth, viewport)).toBe(contentWidth - viewport);
    expect(scrollEndOffset(viewport, viewport)).toBe(0);
    expect(scrollEndOffset(100, viewport)).toBe(0);
  });

  test("rubber-band offsets stay on the plot edge", () => {
    expect(settledScrollOffset(-40, 120)).toBe(0);
    expect(settledScrollOffset(48, 120)).toBe(48);
    expect(settledScrollOffset(180, 120)).toBe(120);
    expect(settledScrollOffset(12, 0)).toBe(0);
  });
});

describe("growth label x vs data point", () => {
  const plotLeft = GROWTH_PLOT_LEFT;
  const step = 32;
  const months = ["Jan", "Feb", "Mar", "Apr", "May"];

  test("chart-kit dummy y-label pad moves the first point past half a month", () => {
    expect(chartKitPlotLeft(0)).toBe(CHART_PLOT_BASE_LEFT);
    expect(GROWTH_PLOT_LEFT).toBe(chartKitPlotLeft(GROWTH_Y_LABEL_PAD));
    expect(GROWTH_PLOT_LEFT).toBeGreaterThanOrEqual(MONTH_LABEL_WIDTH / 2);
  });

  test("every label anchor is the data-point x, including the first point", () => {
    for (const index of months.keys()) {
      const pointX = growthPointX(index, plotLeft, step);
      expect(pointX).toBe(plotLeft + index * step);
      const frame = xLabelFrame(
        pointX,
        growthLabelAlign(index, plotLeft),
        xLabelWidth(months[index]!),
      );
      expect(frame.anchorX).toBe(pointX);
    }
  });

  test("the first label is centred on its point and fully visible at clip x=0", () => {
    const pointX = growthPointX(0, plotLeft, step);
    expect(growthLabelAlign(0, plotLeft)).toBe("middle");
    const frame = xLabelFrame(pointX, "middle", xLabelWidth("Jan"));
    expect((frame.left + frame.right) / 2).toBe(pointX);
    expect(frame.left).toBeGreaterThanOrEqual(0);
    expect(xLabelFullyVisible(frame.left)).toBe(true);
    expect(
      firstGrowthLabelFullyVisible({
        align: "middle",
        clipLeft: 0,
        hostX: pointX,
        labelWidth: xLabelWidth("Jan"),
      }),
    ).toBe(true);
  });

  test("a centred first label at x=0 is clipped; start-align on that point is not", () => {
    expect(
      firstGrowthLabelFullyVisible({
        align: "middle",
        clipLeft: 0,
        hostX: 0,
        labelWidth: MONTH_LABEL_WIDTH,
      }),
    ).toBe(false);
    expect(growthLabelAlign(0, 0)).toBe("start");
    const frame = xLabelFrame(0, "start", xLabelWidth("Jan"));
    expect(frame.left).toBe(0);
    expect(xLabelFullyVisible(frame.left)).toBe(true);
  });

  test("later labels stay centred on their points", () => {
    for (let index = 1; index < months.length; index += 1) {
      expect(growthLabelAlign(index, plotLeft)).toBe("middle");
      const pointX = growthPointX(index, plotLeft, step);
      const frame = xLabelFrame(pointX, "middle", xLabelWidth(months[index]!));
      expect((frame.left + frame.right) / 2).toBe(pointX);
    }
  });

  test("a growth plot beside the y-axis keeps the first point out of the gutter", () => {
    const axisWidth = 66;
    const hostWidth = 370;
    const plotWidth = growthPlotWidth(hostWidth, axisWidth);
    expect(plotWidth).toBe(304);
    expect(growthSliceWidth(12, 32)).toBe(GROWTH_PLOT_LEFT + 11 * 32 + 18);
    expect(growthContentWidth(plotWidth, 12, 32)).toBe(GROWTH_PLOT_LEFT + 11 * 32 + 18);
    const start = growthPointHostX({
      axisWidth,
      index: 0,
      offset: 0,
      plotLeft: GROWTH_PLOT_LEFT,
      step: 32,
    });
    expect(start).toBe(axisWidth + GROWTH_PLOT_LEFT);
    const plotX = start - axisWidth;
    expect(
      firstGrowthLabelFullyVisible({
        align: growthLabelAlign(0, GROWTH_PLOT_LEFT),
        clipLeft: 0,
        hostX: plotX,
        labelWidth: xLabelWidth("Jan"),
      }),
    ).toBe(true);
    const endOffset = scrollEndOffset(growthContentWidth(plotWidth, 12, 32), plotWidth);
    expect(
      growthPointHostX({
        axisWidth,
        index: 0,
        offset: endOffset,
        plotLeft: GROWTH_PLOT_LEFT,
        step: 32,
      }),
    ).toBeLessThan(axisWidth);
  });

  test("when the series fits the plot, label x still matches the stretched point step", () => {
    const plotWidth = 304;
    const count = 5;
    const gap = 32;
    const contentWidth = growthContentWidth(plotWidth, count, gap);
    expect(contentWidth).toBe(plotWidth);
    const step = growthPointStep(count, contentWidth);
    expect(step).toBeGreaterThan(gap);
    const first = growthPointX(0, GROWTH_PLOT_LEFT, step);
    expect(first).toBe(GROWTH_PLOT_LEFT);
    const frame = xLabelFrame(first, growthLabelAlign(0), xLabelWidth("Jan"));
    expect(frame.anchorX).toBe(first);
    expect(frame.left).toBeGreaterThanOrEqual(0);
    expect(growthPointX(1, GROWTH_PLOT_LEFT, step) - first).toBe(step);
  });
});

describe("bar label x vs bar centre", () => {
  const plotLeft = CHART_PLOT_BASE_LEFT;
  const slot = 36;

  test("the label x is the bar centre for every index, including the first bar", () => {
    for (const index of [0, 1, 2, 5, 11]) {
      const center = barCenterX(index, plotLeft, slot);
      expect(barLabelX(index, plotLeft, slot)).toBe(center);
      const bandX = plotLeft + slot * (BAR_PADDING_OUTER + index);
      expect(center).toBe(bandX + (slot * BAR_BAND) / 2);
    }
  });

  test("consecutive labels are one slot apart, not shifted by one bar", () => {
    expect(barLabelX(1, plotLeft, slot) - barLabelX(0, plotLeft, slot)).toBe(slot);
    expect(barLabelX(2, plotLeft, slot) - barLabelX(1, plotLeft, slot)).toBe(slot);
  });

  test("the first bar label is not in the y-axis tick gutter", () => {
    const first = barLabelX(0, plotLeft, slot);
    expect(first).toBeGreaterThan(plotLeft);
    const frame = xLabelFrame(first, barLabelAlign(), xLabelWidth("Jan"));
    expect(frame.left).toBeGreaterThanOrEqual(0);
    expect(xLabelFullyVisible(frame.left)).toBe(true);
    expect(first).not.toBe(0);
    expect(frame.anchorX).toBe(first);
  });

  test("a sibling plot sizes content from the plot origin, not the y-axis overlay", () => {
    const plotWidth = 304;
    expect(barSliceWidth(12, slot)).toBe(CHART_PLOT_BASE_LEFT + slot * (12 - 0.12 + 0.08 * 2) + 14);
    expect(barContentWidth(plotWidth, 12, slot)).toBe(barSliceWidth(12, slot));
    expect(barContentWidth(plotWidth, 1, slot)).toBe(plotWidth);
  });

  test("when the series fits the plot, label x still matches the stretched bar centre", () => {
    const plotWidth = 304;
    const count = 5;
    const contentWidth = barContentWidth(plotWidth, count, slot);
    expect(contentWidth).toBe(plotWidth);
    const step = barBandStep(count, contentWidth);
    expect(step).toBeGreaterThan(slot);
    expect(barLabelX(0, plotLeft, step)).toBe(barCenterX(0, plotLeft, step));
    expect(barLabelX(1, plotLeft, step) - barLabelX(0, plotLeft, step)).toBeCloseTo(step);
    const frame = xLabelFrame(barLabelX(0, plotLeft, step), "middle", xLabelWidth("Jan"));
    expect(frame.left).toBeGreaterThanOrEqual(0);
    expect(frame.anchorX).not.toBe(0);
  });
});

describe("visible x-label indexes", () => {
  test("always includes the first point and skips overlapping later labels", () => {
    const labels = ["Jan", "Feb", "Mar", "Apr"];
    const indexes = visibleXLabelIndexes({
      alignAt: (index) => growthLabelAlign(index, GROWTH_PLOT_LEFT),
      count: labels.length,
      minGap: 6,
      widthAt: (index) => xLabelWidth(labels[index] ?? ""),
      xAt: (index) => growthPointX(index, GROWTH_PLOT_LEFT, 32),
    });
    expect(indexes[0]).toBe(0);
    expect(indexes).toContain(0);
    expect(indexes).toContain(1);
    const barIndexes = visibleXLabelIndexes({
      alignAt: barLabelAlign,
      count: 12,
      widthAt: () => xLabelWidth("Jan"),
      xAt: (index) => barLabelX(index, CHART_PLOT_BASE_LEFT, 36),
    });
    expect(barIndexes[0]).toBe(0);
    expect(barIndexes.length).toBeGreaterThan(1);
  });
});
