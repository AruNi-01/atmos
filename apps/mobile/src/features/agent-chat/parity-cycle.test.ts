// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { PARITY_FIXTURE_IDS } from "@atmos/agent-transcript";
import {
  PARITY_HOLD_MS,
  parityCycleFrames,
  parityPinnedFrame,
  parityReadyLine,
} from "./parity-cycle";

describe("parity cycle", () => {
  test("walks every fixture in light, then dark", () => {
    const frames = parityCycleFrames();
    expect(frames).toHaveLength(PARITY_FIXTURE_IDS.length * 2);
    expect(frames[0]).toEqual({ id: "F1", theme: "light" });
    expect(frames[PARITY_FIXTURE_IDS.length - 1]).toEqual({ id: "F13", theme: "light" });
    expect(frames[PARITY_FIXTURE_IDS.length]).toEqual({ id: "F1", theme: "dark" });
    expect(frames.at(-1)).toEqual({ id: "F13", theme: "dark" });
    expect(parityReadyLine(frames[0]!, 0)).toBe("[parity] ready F1 light #0");
    expect(parityReadyLine(frames.at(-1)!, frames.length - 1)).toBe("[parity] ready F13 dark #25");
  });

  test("holds each frame long enough to screenshot", () => {
    expect(PARITY_HOLD_MS).toBeGreaterThanOrEqual(10_000);
  });

  test("pins a query fixture and defaults a missing theme to light", () => {
    expect(parityPinnedFrame("", "dark")).toBeNull();
    expect(parityPinnedFrame("  ", "dark")).toBeNull();
    expect(parityPinnedFrame("F3", "dark")).toEqual({ id: "F3", theme: "dark" });
    expect(parityPinnedFrame("F3", "")).toEqual({ id: "F3", theme: "light" });
    expect(parityPinnedFrame(" F12 ", "nope")).toEqual({ id: "F12", theme: "light" });
  });
});
