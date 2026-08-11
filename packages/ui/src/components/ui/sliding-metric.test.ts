import { describe, expect, test } from "bun:test";

import {
  compactSlidingParts,
  currencySlidingParts,
  percentSlidingParts,
} from "./sliding-metric";

describe("compactSlidingParts", () => {
  test("uses K/M for en", () => {
    expect(compactSlidingParts(11_000, "en").suffix).toBe("K");
    expect(compactSlidingParts(11_000, "en").value).toBe(11);
    expect(compactSlidingParts(2_500_000, "en").suffix).toBe("M");
  });

  test("uses 万/亿 for zh", () => {
    expect(compactSlidingParts(12_000, "zh-CN").suffix).toBe("万");
    expect(compactSlidingParts(200_000_000, "zh-CN").suffix).toBe("亿");
  });
});

describe("currencySlidingParts", () => {
  test("prefixes $ and keeps small values with decimals", () => {
    const small = currencySlidingParts(0.42, "en", "compact");
    expect(small.prefix).toBe("$");
    expect(small.value).toBe(0.42);
    expect(small.decimals).toBe(2);

    const compact = currencySlidingParts(11_200, "en", "compact");
    expect(compact.prefix).toBe("$");
    expect(compact.suffix).toBe("K");
  });
});

describe("percentSlidingParts", () => {
  test("appends %", () => {
    const parts = percentSlidingParts(45.2, "en", 1);
    expect(parts.suffix).toBe("%");
    expect(parts.value).toBe(45.2);
  });
});
