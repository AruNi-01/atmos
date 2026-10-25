// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { CHART_X_LABEL_BAND, overlayPlotHeight } from "./chart-geometry";
import {
  columnIndicatorColor,
  columnIndicatorHostX,
  columnIndicatorLine,
} from "./column-indicator";

describe("column indicator", () => {
  test("uses a dark stroke on light charts and a light stroke on dark charts", () => {
    expect(columnIndicatorColor(false)).toBe("rgba(15,23,42,0.45)");
    expect(columnIndicatorColor(true)).toBe("rgba(255,255,255,0.55)");
  });

  test("ends on the x-axis above the label band and uses the area-chart dash", () => {
    const chartHeight = 220;
    const line = columnIndicatorLine({ chartHeight, x: 48 });
    expect(line).toEqual({
      strokeDasharray: [3, 4],
      strokeWidth: 1,
      x1: 48,
      x2: 48,
      y1: 0,
      y2: overlayPlotHeight(chartHeight),
    });
    expect(line.y2).toBe(chartHeight - CHART_X_LABEL_BAND);
    expect(line.y2).toBeLessThan(chartHeight);
    expect(columnIndicatorLine({ chartHeight: 10, x: 4 }).y2).toBe(0);
  });

  test("the host x is the bar centre, not the slot boundary between months", () => {
    const mar = { offset: 0, width: 22, x: 100 };
    const apr = { offset: 0, width: 22, x: 136 };
    const marCenter = columnIndicatorHostX(mar);
    const gap = (mar.x + mar.width + apr.x) / 2;
    expect(marCenter).toBe(111);
    expect(columnIndicatorHostX(apr)).toBe(147);
    expect(marCenter).not.toBe(gap);
    expect(columnIndicatorHostX({ ...mar, offset: 20 })).toBe(91);
    expect(columnIndicatorHostX({ ...mar, axisWidth: 48 })).toBe(159);
  });
});
