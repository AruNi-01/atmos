// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { popoverSeriesTint } from "./chart-popover-mark";

const charts = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "charts.tsx"), "utf8");

describe("chart popover marks", () => {
  test("uses the series color, not a forced white glyph", () => {
    expect(popoverSeriesTint("#0284C7")).toBe("#0284C7");
    expect(popoverSeriesTint("#0284C7")).not.toBe("#ffffff");
    expect(charts).toContain("tintColor={popoverSeriesTint(color)}");
    const mark = charts.slice(
      charts.indexOf("function seriesMark"),
      charts.indexOf("type PointTip"),
    );
    expect(mark).not.toContain('tintColor="#ffffff"');
    expect(mark).toContain("onDark");
  });
});
