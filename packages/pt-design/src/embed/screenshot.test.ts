import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runSessionTool } from "../agent/session-tools";
import { createHeadlessSession } from "../core/headless-session";
import { PtDesignError } from "../protocol";
import { boardCropFromScene } from "./preview-crop";

describe("S33 screenshot", () => {
  test("headless pt_screenshot is path_denied (live tab only)", () => {
    try {
      runSessionTool(createHeadlessSession(), { name: "pt_screenshot", args: {} });
      throw new Error("expected path_denied");
    } catch (error) {
      expect(error).toBeInstanceOf(PtDesignError);
      expect((error as PtDesignError).code).toBe("path_denied");
    }
  });

  test("preview crop maps scene content into the canvas origin, not the empty camera", () => {
    const crop = boardCropFromScene(
      { left: 40, top: 20 },
      { x: 240, y: 160, w: 180, h: 48 },
      { scrollX: -200, scrollY: -100, zoom: { value: 1 } },
      16,
    );
    expect(crop.x).toBe(40 + (240 - 200) - 16);
    expect(crop.y).toBe(20 + (160 - 100) - 16);
    expect(crop.w).toBe(180 + 32);
    expect(crop.h).toBe(48 + 32);
  });

  test("live preview capture prefers the painted board + overlay, not bbox-rect SVG", () => {
    const src = readFileSync(new URL("./screenshot.ts", import.meta.url), "utf8");
    expect(src).toContain("@zumer/snapdom");
    expect(src).toContain("snapdom.toCanvas");
    expect(src).toContain("data-pt-overlay");
    expect(src).toContain("pt-design-board");
    expect(src).toContain("preview === true");
    expect(src).toContain("boardCropFromScene");
    expect(src).toContain("preview-crop");
    expect(src).not.toContain("data-pt-preview");
    expect(src).not.toContain("sketchPreviewFromPersist");
    const app = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(app).toContain("captureLiveScreenshot");
    expect(app).toContain("PREVIEW_CAPTURE_MAX_EDGE");
    expect(app).toContain("persistPreviewImage");
    expect(app).not.toContain("sketchPreviewFromPersist");
    expect(src).toContain("PREVIEW_CAPTURE_MAX_EDGE");
    expect(src).toContain("image/webp");
    expect(src).not.toContain("Math.min(320");
  });

  test.skip("S33 live capture returns png bytes — captureLiveScreenshot needs a real Excalidraw board + overlay", () => {
    // Live PNG bytes are a playground/E2E concern. See TEST.md S33.
  });
});
