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
  chartTipResetSignature,
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

  test("scope or series values reset the tip even when count, labels, and peak match", () => {
    const labels = ["Mar", "Apr", "May"];
    const sameShape = { labels, values: [1, 4, 2] };
    const otherValues = { labels, values: [2, 4, 1] };
    expect(chartTipResetSignature(sameShape)).not.toBe(chartTipResetSignature(otherValues));
    expect(chartTipResetSignature({ ...sameShape, resetKey: "all" })).not.toBe(
      chartTipResetSignature({ ...sameShape, resetKey: "computer-a" }),
    );
    expect(charts).toContain("chartTipResetSignature");
    expect(charts).not.toContain('`${count}:${labels[0] ?? ""}:${labels[count - 1] ?? ""}`');
  });

  test("pinch begin always releases a persisted stacked tip", () => {
    const start = charts.indexOf("onBegin(token) {");
    const pinchBegin = charts.slice(
      start,
      charts.indexOf("onCommit(next, anchor, focal, token)", start),
    );
    expect(start).toBeGreaterThan(-1);
    expect(pinchBegin).toContain("handlers.current.onRelease()");
    expect(pinchBegin).not.toContain("if (holding.current)");
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

  test("the growth chart sits beside the y-axis and places custom labels on each point", () => {
    const growth = charts.slice(
      charts.indexOf("export function UsageGrowthChart"),
      charts.indexOf("export function UsageStackedChart"),
    );
    expect(growth).toContain('axisPlacement="start"');
    expect(growth).toContain('labelStrategy="hide"');
    expect(growth).toContain("yAxisLabelWidth={GROWTH_Y_LABEL_PAD}");
    expect(growth).toContain("growthLabelAlign");
    expect(growth).toContain("growthPointX");
    expect(growth).toContain("GROWTH_PLOT_LEFT");
    expect(growth).not.toContain('edgeLabelPolicy="shift"');
    expect(growth).not.toContain("showYAxisLabels");
    expect(charts).toContain("CHART_X_LABEL_BAND");
  });

  test("the stacked chart sits beside the y-axis and labels each bar at its centre", () => {
    const stacked = charts.slice(charts.indexOf("export function UsageStackedChart"));
    expect(stacked).toContain('axisPlacement="start"');
    expect(stacked).toContain("showXAxisLabels={false}");
    expect(stacked).toContain("barLabelX");
    expect(stacked).toContain("barBandStep");
    expect(stacked).not.toContain("barPlotLeft");
  });
});
