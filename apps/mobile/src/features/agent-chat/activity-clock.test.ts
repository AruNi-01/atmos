// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  ACTIVITY_CLOCK_TICK_MS,
  ACTIVITY_STATUS_SHIFT_PX,
  ACTIVITY_STATUS_SPRING,
  activityClockAnchor,
  activityClockLabel,
  activityClockUnits,
  activityElapsedMs,
  clearActivityClockAnchors,
} from "./activity-clock";

const dir = dirname(fileURLToPath(import.meta.url));

describe("activity clock", () => {
  beforeEach(() => {
    clearActivityClockAnchors();
  });

  test("keeps the first anchor and ticks from worked_ms", () => {
    const anchor = activityClockAnchor("turn-1", 5000, 10_000);
    expect(anchor).toBe(5_000);
    expect(activityClockAnchor("turn-1", 0, 12_000)).toBe(5_000);
    expect(activityElapsedMs(anchor, 12_000)).toBe(7_000);
    expect(activityClockAnchor("turn-2", null, 20_000)).toBe(20_000);
    expect(activityElapsedMs(20_000, 19_000)).toBe(0);
  });

  test("splits the duration the way the web clock does", () => {
    expect(activityClockUnits(0)).toEqual([{ unit: "s", value: 0 }]);
    expect(activityClockUnits(14_000)).toEqual([{ unit: "s", value: 14 }]);
    expect(activityClockLabel(14_000)).toBe("14s");
    expect(activityClockUnits(15 * 60_000 + 23_000)).toEqual([
      { unit: "m", value: 15 },
      { unit: "s", value: 23 },
    ]);
    expect(activityClockUnits(3_600_000 + 20 * 60_000 + 32_000)).toEqual([
      { unit: "h", value: 1 },
      { unit: "m", value: 20 },
      { unit: "s", value: 32 },
    ]);
    expect(activityClockLabel(3_600_000 + 20 * 60_000 + 32_000)).toBe("1h20m32s");
  });

  test("the row rolls the clock and slides the status", () => {
    expect(ACTIVITY_CLOCK_TICK_MS).toBe(1000);
    expect(ACTIVITY_STATUS_SPRING).toEqual({ damping: 30, mass: 1, stiffness: 300 });
    expect(ACTIVITY_STATUS_SHIFT_PX).toBe(12);
    const row = readFileSync(join(dir, "activity-row.tsx"), "utf8");
    expect(row).toContain("TextShimmer");
    expect(row).toContain("activityRowLabel");
    expect(row).toContain("theme.colors.secondaryLabel");
    const shimmer = readFileSync(join(dir, "motion/text-shimmer.tsx"), "utf8");
    expect(shimmer).toContain('const SHIMMER_BASE_LIGHT = "#a1a1aa"');
    expect(shimmer).toContain('const SHIMMER_BASE_DARK = "#71717a"');
    expect(shimmer).toContain('const SHIMMER_HIGHLIGHT_LIGHT = "#000000"');
    expect(shimmer).toContain('const SHIMMER_HIGHLIGHT_DARK = "#ffffff"');
    expect(shimmer).toContain("const textStyle = [style, { color: base }]");
    expect(shimmer).not.toContain("theme.colors.secondaryLabel");
    expect(shimmer).not.toContain("theme.colors.label");
  });
});
