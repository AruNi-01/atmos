// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(here, "TokenUsageScreen.tsx"), "utf8");
const charts = readFileSync(join(here, "charts.tsx"), "utf8");

describe("heatmap layout", () => {
  test("reserves plot height and does not animate the card layout", () => {
    expect(screen).toContain("minHeight: HEATMAP_PLOT_HEIGHT");
    expect(screen).not.toContain("LinearTransition");
    expect(screen).not.toContain("heatmapLayout");
    expect(screen).not.toContain("layout={");
    expect(charts).toContain(
      "export const HEATMAP_PLOT_HEIGHT = MONTH_LABEL_HEIGHT + 7 * STEP - GAP",
    );
  });

  test("an empty year still occupies the plot height", () => {
    expect(charts).toContain("minHeight: HEATMAP_PLOT_HEIGHT");
    expect(charts).toContain("if (!end || values.length === 0)");
    expect(charts).toContain("return <View style={styles.heatmapPlot} />");
  });
});
