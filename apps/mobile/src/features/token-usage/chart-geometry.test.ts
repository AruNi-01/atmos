// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  CHART_X_LABEL_INSET,
  chartXFromGesture,
  firstAxisLabelFullyVisible,
  scrollContentShift,
  scrollEndOffset,
} from "./chart-geometry";

describe("chart x-axis inset", () => {
  test("shifts scroll content so the first label sits in the viewport", () => {
    expect(CHART_X_LABEL_INSET).toBe(20);
    expect(scrollContentShift(66, 20)).toBe(46);
    expect(firstAxisLabelFullyVisible({ inset: 20, labelWidth: 24 })).toBe(true);
    expect(firstAxisLabelFullyVisible({ inset: 8, labelWidth: 24 })).toBe(false);
  });

  test("gesture chartX subtracts the same inset", () => {
    const axisWidth = 66;
    const inset = 20;
    const firstPointHostX = axisWidth + inset;
    expect(chartXFromGesture(firstPointHostX, 0, inset)).toBe(axisWidth);
    expect(chartXFromGesture(axisWidth, 12, inset)).toBe(axisWidth + 12 - inset);
  });

  test("end placement includes the label inset extra travel", () => {
    const axisWidth = 66;
    const inset = 20;
    const viewport = 400;
    const contentWidth = 500;
    const shift = scrollContentShift(axisWidth, inset);
    const lane = viewport - axisWidth;
    const scrollContent = contentWidth - shift;
    expect(scrollEndOffset(contentWidth, viewport, inset)).toBe(scrollContent - lane);
    expect(scrollEndOffset(contentWidth, viewport, inset)).toBe(contentWidth - viewport + inset);
    expect(scrollEndOffset(viewport, viewport, inset)).toBe(inset);
    expect(scrollEndOffset(100, viewport, inset)).toBe(0);
  });
});
