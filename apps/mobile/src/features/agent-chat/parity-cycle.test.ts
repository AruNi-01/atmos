// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { PARITY_FIXTURE_IDS } from "@atmos/agent-transcript";
import {
  PARITY_HOLD_MS,
  createParityClock,
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

  test("holds each frame longer than a stalled simulator screenshot", () => {
    // Run 38816093468: one simctl screenshot blocked for 61s, so the 15s hold
    // advanced and several PNGs were the same later frame.
    expect(PARITY_HOLD_MS).toBeGreaterThanOrEqual(75_000);
  });

  test("one clock serves every mounted preview", () => {
    const pending: Array<() => void> = [];
    const clock = createParityClock(
      PARITY_HOLD_MS,
      (fn) => {
        pending.push(fn);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      () => undefined,
    );
    const seen: number[] = [];
    clock.subscribe((next) => seen.push(next));
    expect(seen).toEqual([0]);
    expect(clock.claim("F1:light:0")).toBe(true);
    expect(clock.claim("F1:light:0")).toBe(false);
    expect(clock.arm(26)).toBe(true);
    expect(clock.arm(26)).toBe(false);
    expect(pending).toHaveLength(1);
    pending[0]!();
    expect(clock.index()).toBe(1);
    expect(seen).toEqual([0, 1]);
    expect(clock.claim("F2:light:1")).toBe(true);
    expect(clock.arm(26)).toBe(true);
    expect(pending).toHaveLength(2);
    clock.reset();
    expect(clock.index()).toBe(0);
    expect(clock.arm(1)).toBe(false);
  });

  test("pins a query fixture and defaults a missing theme to light", () => {
    expect(parityPinnedFrame("", "dark")).toBeNull();
    expect(parityPinnedFrame("  ", "dark")).toBeNull();
    expect(parityPinnedFrame("F3", "dark")).toEqual({ id: "F3", theme: "dark" });
    expect(parityPinnedFrame("F3", "")).toEqual({ id: "F3", theme: "light" });
    expect(parityPinnedFrame(" F12 ", "nope")).toEqual({ id: "F12", theme: "light" });
  });
});
