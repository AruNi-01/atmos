// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  CHART_X_LABEL_BAND,
  CHART_X_LABEL_HALF,
  chartXFromGesture,
  firstAxisLabelFullyVisible,
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
});
