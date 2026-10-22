// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  CHART_PLOT_BASE_LEFT,
  CHART_X_LABEL_BAND,
  CHART_X_LABEL_HALF,
  chartXFromGesture,
  firstAxisLabelFullyVisible,
  firstGrowthLabelFullyVisible,
  growthContentWidth,
  growthPlotWidth,
  growthPointHostX,
  growthSliceWidth,
  overlayPlotHeight,
  scrollEndOffset,
  windowedSliceFrame,
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

  test("a growth plot beside the y-axis keeps Nov on January, not in the gutter", () => {
    const axisWidth = 66;
    const hostWidth = 370;
    const plotWidth = growthPlotWidth(hostWidth, axisWidth);
    expect(plotWidth).toBe(304);
    expect(growthSliceWidth(12, 32)).toBe(CHART_PLOT_BASE_LEFT + 11 * 32 + 18);
    expect(growthContentWidth(plotWidth, 12, 32)).toBe(CHART_PLOT_BASE_LEFT + 11 * 32 + 18);
    const start = growthPointHostX({
      axisWidth,
      index: 0,
      offset: 0,
      plotLeft: CHART_PLOT_BASE_LEFT,
      step: 32,
    });
    expect(start).toBe(axisWidth + CHART_PLOT_BASE_LEFT);
    expect(
      firstGrowthLabelFullyVisible({
        axisWidth,
        edgeLabelPolicy: "show",
        hostX: start,
        labelHalf: CHART_PLOT_BASE_LEFT,
        overlayGutter: false,
      }),
    ).toBe(true);
    const endOffset = scrollEndOffset(growthContentWidth(plotWidth, 12, 32), plotWidth);
    expect(
      growthPointHostX({
        axisWidth,
        index: 0,
        offset: endOffset,
        plotLeft: CHART_PLOT_BASE_LEFT,
        step: 32,
      }),
    ).toBeLessThan(axisWidth);
    expect(
      growthPointHostX({
        axisWidth,
        index: 1,
        offset: endOffset,
        plotLeft: CHART_PLOT_BASE_LEFT,
        step: 32,
      }),
    ).toBeLessThan(axisWidth);
    expect(
      firstGrowthLabelFullyVisible({
        axisWidth,
        edgeLabelPolicy: "shift",
        hostX: start,
        labelHalf: CHART_PLOT_BASE_LEFT,
        overlayGutter: false,
      }),
    ).toBe(false);
    expect(
      firstGrowthLabelFullyVisible({
        axisWidth,
        edgeLabelPolicy: "show",
        hostX: 0,
        labelHalf: CHART_X_LABEL_HALF,
        overlayGutter: true,
      }),
    ).toBe(false);
  });
});
