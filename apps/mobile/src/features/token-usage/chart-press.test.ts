// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  chartOpensOnTap,
  chartTipPersistsOnRelease,
  GROWTH_CHART_TIP,
  STACKED_CHART_TIP,
} from "./chart-press";

const charts = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "charts.tsx"), "utf8");

describe("chart press policy", () => {
  test("stacked tap opens and persists; growth stays hold-to-preview", () => {
    expect(chartOpensOnTap(STACKED_CHART_TIP)).toBe(true);
    expect(chartTipPersistsOnRelease(STACKED_CHART_TIP)).toBe(true);
    expect(chartOpensOnTap(GROWTH_CHART_TIP)).toBe(false);
    expect(chartTipPersistsOnRelease(GROWTH_CHART_TIP)).toBe(false);
  });

  test("stacked source includes a tap gesture and persist-on-release", () => {
    expect(charts).toContain("Gesture.Tap()");
    expect(charts).toContain("open: STACKED_CHART_TIP");
    expect(charts).toContain("Gesture.Exclusive(pan, tap)");
    const growth = charts.slice(
      charts.indexOf("export function UsageGrowthChart"),
      charts.indexOf("export function UsageStackedChart"),
    );
    expect(growth).not.toContain("STACKED_CHART_TIP");
  });

  test("horizontal drag clears a persisted stacked tip; end placement does not add inset", () => {
    expect(charts).toContain("if (chartTipPersistsOnRelease(open)) handlers.current.onRelease()");
    expect(charts).toContain("scrollEndOffset(contentWidth, viewport)");
    expect(charts).not.toContain("labelInset");
  });

  test("the y-axis overlay stops above the x-label band and slices are not cropped at the plot origin", () => {
    expect(charts).toContain("overlayPlotHeight(height, CHART_X_LABEL_BAND)");
    expect(charts).toContain("columnIndicatorHostX");
    expect(charts).toContain("windowedSliceFrame");
    expect(charts).not.toContain("marginLeft: -PLOT_X");
    expect(charts).not.toContain("marginLeft: -shift");
    expect(charts).not.toContain("scrollContentShift");
    expect(charts).not.toContain("CHART_X_LABEL_INSET");
  });
});
