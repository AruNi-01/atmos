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
  parityPaintedLine,
  parityReadyLine,
  parityTailOwned,
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
    expect(parityPaintedLine(frames[0]!, 0)).toBe("[parity] painted F1 light #0");
    expect(parityPaintedLine(frames.at(-1)!, frames.length - 1)).toBe(
      "[parity] painted F13 dark #25",
    );
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

  test("the latest preview owns the tail until it releases", () => {
    const clock = createParityClock(
      30_000,
      () => 1 as unknown as ReturnType<typeof setTimeout>,
      () => undefined,
      () => 0,
    );
    const seen: number[] = [];
    clock.subscribeOwner(() => seen.push(clock.owner()));
    const first = clock.takeOwner();
    const second = clock.takeOwner();
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(clock.owner()).toBe(second);
    expect(seen).toEqual([1, 2]);
    clock.releaseOwner(first);
    expect(clock.owner()).toBe(second);
    expect(seen).toEqual([1, 2]);
    clock.releaseOwner(second);
    expect(clock.owner()).toBe(0);
    expect(seen).toEqual([1, 2, 0]);
    clock.releaseOwner(second);
    expect(seen).toEqual([1, 2, 0]);

    const earlier = clock.takeOwner();
    const later = clock.takeOwner();
    const beforeBind = clock.tailSnapshot();
    clock.bindMount("earlier", earlier);
    clock.bindMount("later", later);
    expect(clock.tailSnapshot()).not.toBe(beforeBind);
    expect(clock.tailSnapshot()).toEqual({
      owner: later,
      byMount: { earlier, later },
    });
    expect(clock.tailSnapshot()).toBe(clock.tailSnapshot());
    clock.releaseOwner(later);
    expect(clock.owner()).toBe(earlier);
    expect(clock.tailSnapshot().byMount).toEqual({ earlier, later });
    clock.bindMount("later", 0);
    expect(clock.tailSnapshot()).toEqual({ owner: earlier, byMount: { earlier } });
    clock.bindMount("later", 0);
    expect(clock.tailSnapshot().byMount).toEqual({ earlier });
    clock.reset();
    expect(clock.owner()).toBe(0);
    expect(clock.tailSnapshot()).toEqual({ owner: 0, byMount: {} });
    expect(clock.takeOwner()).toBe(1);
    const visible = clock.takeOwner();
    clock.bindMount("covered", 1);
    clock.bindMount("visible", visible);
    const snapshot = clock.tailSnapshot();
    expect(parityTailOwned(true, "visible", snapshot)).toBe(true);
    expect(parityTailOwned(true, "covered", snapshot)).toBe(false);
    expect(parityTailOwned(false, "visible", snapshot)).toBe(false);
  });

  test("pins a query fixture and defaults a missing theme to light", () => {
    expect(parityPinnedFrame("", "dark")).toBeNull();
    expect(parityPinnedFrame("  ", "dark")).toBeNull();
    expect(parityPinnedFrame("F3", "dark")).toEqual({ id: "F3", theme: "dark" });
    expect(parityPinnedFrame("F3", "")).toEqual({ id: "F3", theme: "light" });
    expect(parityPinnedFrame(" F12 ", "nope")).toEqual({ id: "F12", theme: "light" });
    expect(parityPinnedFrame("F4", "light", "reduced")).toEqual({
      id: "F4",
      motion: "reduced",
      theme: "light",
    });
    expect(parityPinnedFrame("F4", "light", "nope")).toEqual({ id: "F4", theme: "light" });
    expect(parityPinnedFrame("F4", "light", "", "script")).toEqual({
      id: "F4",
      replay: "script",
      theme: "light",
    });
    expect(parityPinnedFrame("F4", "dark", "reduced", "script")).toEqual({
      id: "F4",
      motion: "reduced",
      replay: "script",
      theme: "dark",
    });
    expect(parityPinnedFrame("F4", "light", "", "nope")).toEqual({ id: "F4", theme: "light" });
    expect(parityPinnedFrame("F12", "light", "", "", "steps")).toEqual({
      id: "F12",
      lane: "steps",
      theme: "light",
    });
    expect(parityPinnedFrame("f13-tail", "light", "", "", "", "return")).toEqual({
      id: "f13-tail",
      pill: "return",
      theme: "light",
    });
    expect(parityPinnedFrame("f13-tail", "light", "", "", "", "nope")).toEqual({
      id: "f13-tail",
      theme: "light",
    });
    expect(parityPinnedFrame("F1", "light", "", "", "", "", "states")).toEqual({
      id: "F1",
      composer: "states",
      theme: "light",
    });
    expect(parityPinnedFrame("F1", "dark", "", "", "", "", "nope")).toEqual({
      id: "F1",
      theme: "dark",
    });
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
    expect(parseParityDiskFrame('{"id":"stream-tools","theme":"dark"}')).toEqual({
      id: "stream-tools",
      theme: "dark",
    });
    expect(parseParityDiskFrame('{"id":"settled-tools","theme":"light"}')).toEqual({
      id: "settled-tools",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"f13-tail","theme":"dark"}')).toEqual({
      id: "f13-tail",
      theme: "dark",
    });
    expect(parseParityDiskFrame('{"id":"f13-tail","theme":"light","scroll":"away"}')).toEqual({
      id: "f13-tail",
      theme: "light",
      scroll: "away",
    });
    expect(parseParityDiskFrame('{"id":"F1","theme":"light","scroll":"nope"}')).toEqual({
      id: "F1",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"F4","theme":"light","motion":"reduced"}')).toEqual({
      id: "F4",
      motion: "reduced",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"F4","theme":"dark","motion":"nope"}')).toEqual({
      id: "F4",
      theme: "dark",
    });
    expect(
      parseParityDiskFrame('{"id":"F4","theme":"light","motion":"reduced","replay":"script"}'),
    ).toEqual({
      id: "F4",
      motion: "reduced",
      replay: "script",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"F4","theme":"light","replay":"nope"}')).toEqual({
      id: "F4",
      theme: "light",
    });
    expect(
      parseParityDiskFrame('{"id":"F4","theme":"light","replay":"script","atMs":400}'),
    ).toEqual({
      atMs: 400,
      id: "F4",
      replay: "script",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"F4","theme":"light","atMs":"400"}')).toEqual({
      id: "F4",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"F4","theme":"light","atMs":-1}')).toEqual({
      id: "F4",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"F12","theme":"dark","lane":"steps"}')).toEqual({
      id: "F12",
      lane: "steps",
      theme: "dark",
    });
    expect(parseParityDiskFrame('{"id":"F12","theme":"light","lane":"nope"}')).toEqual({
      id: "F12",
      theme: "light",
    });
    expect(
      parseParityDiskFrame('{"id":"f13-tail","theme":"light","scroll":"away","pill":"return"}'),
    ).toEqual({
      id: "f13-tail",
      pill: "return",
      scroll: "away",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"f13-tail","theme":"light","pill":"nope"}')).toEqual({
      id: "f13-tail",
      theme: "light",
    });
    expect(
      parseParityDiskFrame('{"id":"f13-tail","theme":"light","scroll":"away","cards":"lane"}'),
    ).toEqual({
      cards: "lane",
      id: "f13-tail",
      scroll: "away",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"f13-tail","theme":"light","cards":"nope"}')).toEqual({
      id: "f13-tail",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"F1","theme":"light","composer":"states"}')).toEqual({
      composer: "states",
      id: "F1",
      theme: "light",
    });
    expect(parseParityDiskFrame('{"id":"F1","theme":"dark","composer":"nope"}')).toEqual({
      id: "F1",
      theme: "dark",
    });
    expect(parseParityDiskFrame('{"id":"nope","theme":"light"}')).toBeNull();
    expect(parseParityDiskFrame("")).toBeNull();
    expect(parseParityDiskFrame("{")).toBeNull();
  });
});
