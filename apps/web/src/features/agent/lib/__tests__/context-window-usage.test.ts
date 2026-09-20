import { describe, expect, test } from "bun:test";
import {
  contextWindowBarTone,
  contextWindowStats,
  formatCompactTokenCount,
  hasContextWindowStats,
  mergeContextUsageUpdate,
} from "../context-window-usage";

describe("hasContextWindowStats", () => {
  test("requires used and positive context_window (or legacy size)", () => {
    expect(hasContextWindowStats({ used: 10, context_window: 100 })).toBe(true);
    expect(hasContextWindowStats({ used: 10, size: 100 })).toBe(true);
    expect(hasContextWindowStats({ used: 0, context_window: 100 })).toBe(true);
    expect(hasContextWindowStats({ used: 10, context_window: 0 })).toBe(false);
    expect(hasContextWindowStats({ used: 10 })).toBe(false);
    expect(hasContextWindowStats({ context_window: 100 })).toBe(false);
    expect(hasContextWindowStats({ cost: { amount: 0.1 } })).toBe(false);
    expect(hasContextWindowStats(null)).toBe(false);
  });
});

describe("contextWindowStats", () => {
  test("clamps percent to 0–100", () => {
    const mid = contextWindowStats({ used: 50_000, context_window: 100_000 });
    expect(mid).toEqual({ used: 50_000, context_window: 100_000, percent: 50 });
    expect(
      contextWindowStats({ used: 200_000, context_window: 100_000 })?.percent,
    ).toBe(100);
  });
});

describe("mergeContextUsageUpdate", () => {
  test("keeps prior window when update omits it", () => {
    const merged = mergeContextUsageUpdate(
      { used: 10, context_window: 200_000 },
      { used: 20 },
    );
    expect(merged.used).toBe(20);
    expect(merged.context_window).toBe(200_000);
  });
});

describe("formatCompactTokenCount", () => {
  test("formats thousands and millions", () => {
    expect(formatCompactTokenCount(820)).toBe("820");
    expect(formatCompactTokenCount(114_000)).toBe("114k");
    expect(formatCompactTokenCount(1_500)).toBe("1.5k");
    expect(formatCompactTokenCount(1_000_000)).toBe("1M");
    expect(formatCompactTokenCount(2_500_000)).toBe("2.5M");
  });
});

describe("contextWindowBarTone", () => {
  test("warns at or above 70% with theme default below", () => {
    expect(contextWindowBarTone(69.9)).toBe("default");
    expect(contextWindowBarTone(70)).toBe("warning");
    expect(contextWindowBarTone(95)).toBe("warning");
  });
});
