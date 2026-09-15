import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  HANDLE_BACKGROUND,
  HANDLE_INK,
  HANDLE_STROKE_WIDTH,
  isExcalidrawTransparentFill,
  prepareLiveHandle,
} from "./handle";

describe("live handle hit fill", () => {
  test("HANDLE_BACKGROUND is interior-hittable (not Excalidraw transparent)", () => {
    expect(isExcalidrawTransparentFill(HANDLE_BACKGROUND)).toBe(false);
    expect(isExcalidrawTransparentFill("transparent")).toBe(true);
    expect(isExcalidrawTransparentFill("#00000000")).toBe(true);
    expect(isExcalidrawTransparentFill("#fff0")).toBe(true);
  });

  test("prepareLiveHandle unlocks pt handles and applies hittable fill", () => {
    const live = prepareLiveHandle({
      id: "el_run",
      customData: { pt: { id: "run" } },
      backgroundColor: "transparent",
      locked: true,
    });
    expect(live.locked).toBe(false);
    expect(live.backgroundColor).toBe(HANDLE_BACKGROUND);
    expect(live.roughness).toBe(1);
    expect(live.roundness).toEqual({ type: 3, value: 12 });
    expect(live.strokeColor).toBe(HANDLE_INK);
    expect(live.strokeWidth).toBe(HANDLE_STROKE_WIDTH);
    expect(isExcalidrawTransparentFill(live.backgroundColor)).toBe(false);
  });

  test("prepareLiveHandle restores hidden Artist strokes", () => {
    const live = prepareLiveHandle({
      id: "el_run",
      customData: { pt: { id: "run" } },
      strokeColor: "transparent",
      strokeWidth: 0,
    });
    expect(live.strokeColor).toBe(HANDLE_INK);
    expect(live.strokeWidth).toBe(HANDLE_STROKE_WIDTH);
    expect(live.roughness).toBe(1);
  });

  test("prepareLiveHandle restores dark-theme inverted ink on paper handles", () => {
    const live = prepareLiveHandle({
      id: "el_run",
      customData: { pt: { id: "run" } },
      strokeColor: "#fafafa",
      strokeWidth: 2,
      roughness: 1,
    });
    expect(live.strokeColor).toBe(HANDLE_INK);
    expect(live.roughness).toBe(1);
  });

  test("prepareLiveHandle keeps a visible custom stroke", () => {
    const live = prepareLiveHandle({
      id: "el_run",
      customData: { pt: { id: "run" } },
      strokeColor: "#e03131",
      strokeWidth: 4,
      roughness: 1,
    });
    expect(live.strokeColor).toBe("#e03131");
    expect(live.strokeWidth).toBe(4);
  });

  test("prepareLiveHandle restores sketch roughness on smooth stored handles", () => {
    const live = prepareLiveHandle({
      id: "el_cal",
      customData: { pt: { id: "cal" } },
      roughness: 0,
      roundness: null,
      seed: 1,
    });
    expect(live.roughness).toBe(1);
    expect(live.roundness).toEqual({ type: 3, value: 12 });
    expect(live.seed).not.toBe(1);
  });

  test("prepareLiveHandle clamps Excalidraw default 32px corners on stored handles", () => {
    const live = prepareLiveHandle({
      id: "el_run",
      customData: { pt: { id: "run" } },
      roundness: { type: 3 },
      strokeColor: "#1e1e1e",
      strokeWidth: 2,
    });
    expect(live.roundness).toEqual({ type: 3, value: 12 });
  });

  test("prepareLiveHandle follows node radius then the global token", () => {
    const none = prepareLiveHandle({
      id: "el_run",
      customData: { pt: { id: "run", props: { radius: "none" } } },
    });
    expect(none.roundness).toEqual({ type: 3, value: 0 });
    const fromGlobal = prepareLiveHandle(
      {
        id: "el_run",
        customData: { pt: { id: "run" } },
      },
      "lg",
    );
    expect(fromGlobal.roundness).toEqual({ type: 3, value: 28 });
  });

  test("prepareLiveHandle leaves freehand unchanged", () => {
    const el = { id: "draw1", backgroundColor: "transparent", locked: true };
    expect(prepareLiveHandle(el)).toBe(el);
  });

  test("scene-bridge HANDLE_DEFAULTS keep projected handles unlocked", () => {
    const src = readFileSync(new URL("../embed/scene-bridge.ts", import.meta.url), "utf8");
    expect(src).toContain("locked: false");
    expect(src).toContain("roughness: 1");
    expect(src).toContain('strokeColor: "#1e1e1e"');
    expect(src).toContain("strokeWidth: 2");
  });
});
