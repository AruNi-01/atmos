import { describe, expect, test } from "bun:test";
import {
  ATMOS_DARK_DEFAULT_STROKE,
  EXCALIDRAW_DEFAULT_STROKE,
  applyThemeInkToElements,
  canonicalColor,
  canonicalInk,
  defaultStrokeColor,
  displayColor,
  displayInk,
  drawingAppState,
  isDefaultStrokeColor,
  resolveDrawingStrokeColor,
} from "./theme-palette";

describe("theme palette", () => {
  test("light theme keeps canonical colors", () => {
    expect(displayColor("#ffffff", "light")).toBe("#ffffff");
    expect(displayColor("#18181b", "light")).toBe("#18181b");
    expect(canonicalColor("#2e2e33", "light")).toBe("#2e2e33");
  });

  test("dark theme remaps card and label colors without touching accents", () => {
    expect(displayColor("#ffffff", "dark")).toBe("#2e2e33");
    expect(displayColor("#18181b", "dark")).toBe("#f4f4f5");
    expect(displayColor("#fafafa", "dark")).toBe("#18181b");
    expect(displayColor("#3b82f6", "dark")).toBe("#3b82f6");
    expect(displayColor("#ef4444", "dark")).toBe("#ef4444");
    expect(displayColor("transparent", "dark")).toBe("transparent");
  });

  test("dark display colors unmap back to the light IR palette", () => {
    expect(canonicalColor("#2e2e33", "dark")).toBe("#ffffff");
    expect(canonicalColor("#242428", "dark")).toBe("#ffffff");
    expect(canonicalColor("#09090b", "dark")).toBe("#ffffff");
    expect(canonicalColor("#f4f4f5", "dark")).toBe("#18181b");
    expect(canonicalColor("#18181b", "dark")).toBe("#fafafa");
  });

  test("dark drawing defaults keep the official first swatch and remap ink", () => {
    expect(defaultStrokeColor("light")).toBe(EXCALIDRAW_DEFAULT_STROKE);
    expect(defaultStrokeColor("dark")).toBe(ATMOS_DARK_DEFAULT_STROKE);
    expect(displayInk("#1e1e1e", "dark")).toBe("#fafafa");
    expect(canonicalInk("#fafafa", "dark")).toBe("#1e1e1e");
    expect(displayInk("#ef4444", "dark")).toBe("#ef4444");
    expect(drawingAppState("dark")).toEqual({
      currentItemStrokeColor: ATMOS_DARK_DEFAULT_STROKE,
      currentItemBackgroundColor: "transparent",
      isBindingEnabled: true,
      objectsSnapModeEnabled: true,
    });
    expect(drawingAppState("light").currentItemStrokeColor).toBe(EXCALIDRAW_DEFAULT_STROKE);
    expect(isDefaultStrokeColor("#1e1e1e")).toBe(true);
    expect(isDefaultStrokeColor("#fafafa")).toBe(true);
    expect(isDefaultStrokeColor("#ef4444")).toBe(false);
    expect(resolveDrawingStrokeColor("dark", "#1e1e1e")).toBe(ATMOS_DARK_DEFAULT_STROKE);
    expect(resolveDrawingStrokeColor("dark", "#000")).toBe(ATMOS_DARK_DEFAULT_STROKE);
    expect(resolveDrawingStrokeColor("dark", ATMOS_DARK_DEFAULT_STROKE)).toBeUndefined();
    expect(resolveDrawingStrokeColor("dark", "#ef4444")).toBeUndefined();
    expect(resolveDrawingStrokeColor("light", ATMOS_DARK_DEFAULT_STROKE)).toBe(EXCALIDRAW_DEFAULT_STROKE);
    expect(resolveDrawingStrokeColor("light", EXCALIDRAW_DEFAULT_STROKE)).toBeUndefined();
    const remapped = applyThemeInkToElements(
      [{ id: "a", strokeColor: "#1e1e1e" }, { id: "b", strokeColor: "#ef4444" }],
      "dark",
    );
    expect(remapped[0]?.strokeColor).toBe(ATMOS_DARK_DEFAULT_STROKE);
    expect(remapped[1]?.strokeColor).toBe("#ef4444");
  });
});
