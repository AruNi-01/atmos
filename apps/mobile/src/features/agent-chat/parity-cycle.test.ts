// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { PARITY_FIXTURE_IDS } from "@atmos/agent-transcript";
import {
  PARITY_FRAME_FILE,
  PARITY_HOLD_MS,
  createParityClock,
  parseParityDiskFrame,
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
    let now = 0;
    const clock = createParityClock(
      30_000,
      (fn) => {
        pending.push(fn);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      () => undefined,
      () => now,
    );
    const seen: number[] = [];
    clock.subscribe((next) => seen.push(next));
    expect(seen).toEqual([0]);
    expect(clock.claim("F1:light:0")).toBe(true);
    expect(clock.claim("F1:light:0")).toBe(false);
    expect(clock.arm(26)).toBe(true);
    expect(clock.arm(26)).toBe(false);
    expect(pending).toHaveLength(1);
    now = 15_000;
    pending[0]!();
    expect(clock.index()).toBe(0);
    expect(pending).toHaveLength(2);
    now = 30_000;
    pending[1]!();
    expect(clock.index()).toBe(1);
    expect(seen).toEqual([0, 1]);
    expect(clock.claim("F2:light:1")).toBe(true);
    expect(clock.arm(26)).toBe(true);
    expect(pending).toHaveLength(3);
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

  test("parses a Documents pin and rejects a fixture the carousel does not know", () => {
    expect(PARITY_FRAME_FILE).toBe("parity-frame.json");
    expect(parseParityDiskFrame('{"id":"F12","theme":"dark"}')).toEqual({
      id: "F12",
      theme: "dark",
    });
    expect(parseParityDiskFrame('{"id":" F3 ","theme":"light"}')).toEqual({
      id: "F3",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"F1","theme":"nope"}')).toBeNull();
    expect(parseParityDiskFrame('{"id":"nope","theme":"light"}')).toBeNull();
    expect(parseParityDiskFrame("")).toBeNull();
    expect(parseParityDiskFrame("{")).toBeNull();
  });
});
