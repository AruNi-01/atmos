// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  CONTEXT_RING_RADIUS,
  contextRingDash,
  contextWindowBarTone,
  formatCompactTokenCount,
} from "./context-window";

const here = dirname(fileURLToPath(import.meta.url));

describe("formatCompactTokenCount", () => {
  test("formats thousands and millions the way web does", () => {
    expect(formatCompactTokenCount(820)).toBe("820");
    expect(formatCompactTokenCount(114_000)).toBe("114k");
    expect(formatCompactTokenCount(1_500)).toBe("1.5k");
    expect(formatCompactTokenCount(1_000_000)).toBe("1M");
    expect(formatCompactTokenCount(2_500_000)).toBe("2.5M");
  });
});

describe("contextWindowBarTone", () => {
  test("warns at or above 70%", () => {
    expect(contextWindowBarTone(69.9)).toBe("default");
    expect(contextWindowBarTone(70)).toBe("warning");
    expect(contextWindowBarTone(95)).toBe("warning");
  });
});

describe("context ring", () => {
  test("draws the same dash as the web footer ring", () => {
    const full = 2 * Math.PI * CONTEXT_RING_RADIUS;
    expect(contextRingDash(0)).toEqual({ circumference: full, offset: full });
    expect(contextRingDash(100).offset).toBe(0);
    expect(contextRingDash(50).offset).toBeCloseTo(full / 2);
    expect(contextRingDash(150).offset).toBe(0);
    expect(contextRingDash(Number.NaN).offset).toBe(full);
  });
});

describe("context usage card", () => {
  test("uses the web panel type and leaves quota and close off", () => {
    const source = readFileSync(join(here, "cards", "context-card.tsx"), "utf8");
    expect(source).toContain("theme.colors.label");
    expect(source).toContain("theme.colors.secondaryLabel");
    expect(source).toContain('fontWeight: "500"');
    expect(source).toContain("fontSize: 12");
    expect(source).toContain("height: 6");
    expect(source).toContain("contextWindowBarTone");
    expect(source).toContain("formatCompactTokenCount");
    expect(source).not.toContain("chatForeground");
    expect(source).not.toContain("quota");
    expect(source).not.toContain("onClose");
  });
});
