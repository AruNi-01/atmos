import { describe, expect, test } from "bun:test";
import {
  contentBoundsFromPersist,
  isLiveRasterPreview,
  isPreviewBlobPointer,
  isSketchWireframePreview,
  parsePreviewViewBox,
  previewNeedsRegen,
  sketchPreviewFromPersist,
  thumbnailViewBox,
  viewBoxFitsContent,
} from "./preview";

const NODE_PTX = `<page id="page"><button id="go" x="240" y="160" width="180" height="48">Go</button></page>\n`;

describe("pt-design content-fit previews", () => {
  test("PTX nodes produce a viewBox that hugs those coordinates, not 0,0,huge-empty", () => {
    const preview = sketchPreviewFromPersist({ ptx: NODE_PTX })!;
    expect(preview).toContain("data:image/svg+xml");
    expect(decodeURIComponent(preview)).toContain('data-pt-preview="content"');
    const viewBox = parsePreviewViewBox(preview!);
    expect(viewBox).not.toBeNull();
    const content = contentBoundsFromPersist({ ptx: NODE_PTX })!;
    expect(content).toEqual({ x: 240, y: 160, w: 180, h: 48 });
    expect(viewBoxFitsContent(viewBox!, content)).toBe(true);
    expect(viewBox!.x).toBeGreaterThan(200);
    expect(viewBox!.y).toBeGreaterThan(120);
    expect(viewBox!.w).toBeLessThan(280);
    expect(viewBox!.h).toBeLessThan(140);
    expect(viewBox!.x).not.toBe(0);
    expect(viewBox!.y).not.toBe(0);
  });

  test("a giant untagged canvas rect does not become the crop; PT handles win", () => {
    const preview = sketchPreviewFromPersist({
      ptx: NODE_PTX,
      canvas: {
        elements: [
          {
            id: "go",
            type: "rectangle",
            x: 240,
            y: 160,
            width: 180,
            height: 48,
            isDeleted: false,
            customData: { pt: { id: "go", type: "button" } },
          },
          {
            id: "viewport-decoy",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 8000,
            height: 6000,
            isDeleted: false,
          },
        ],
        appState: { viewBackgroundColor: "#fafafa" },
      },
    });
    const viewBox = parsePreviewViewBox(preview!);
    expect(viewBox!.w).toBeLessThan(400);
    expect(viewBox!.h).toBeLessThan(200);
    expect(viewBox!.x + viewBox!.w).toBeGreaterThan(400);
    expect(viewBox!.y + viewBox!.h).toBeGreaterThan(190);
  });

  test("overview cards treat bbox-rect SVGs as stale wireframes, not live artwork", () => {
    const content = { x: 240, y: 160, w: 180, h: 48 };
    const sketch = sketchPreviewFromPersist({ ptx: NODE_PTX })!;
    expect(isSketchWireframePreview(sketch)).toBe(true);
    expect(isLiveRasterPreview(sketch)).toBe(false);
    expect(previewNeedsRegen(sketch, content, "content")).toBe(true);
    expect(
      previewNeedsRegen("data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg viewBox="0 0 320 180"></svg>'), content),
    ).toBe(true);
    expect(previewNeedsRegen("data:image/png;base64,aaaa", content)).toBe(true);
    const livePng = `data:image/png;base64,${"A".repeat(120)}`;
    expect(isSketchWireframePreview(livePng)).toBe(false);
    expect(previewNeedsRegen(livePng, content, "content")).toBe(false);
    const pointer = "idb:pt-preview/doc-1";
    expect(isPreviewBlobPointer(pointer)).toBe(true);
    expect(isLiveRasterPreview(pointer)).toBe(true);
    expect(previewNeedsRegen(pointer, content, "content")).toBe(false);
    const webp = `data:image/webp;base64,${"A".repeat(120)}`;
    expect(isLiveRasterPreview(webp)).toBe(true);
    expect(previewNeedsRegen(webp, content)).toBe(false);
  });

  test("a tall stack of nodes crops to a landscape card window from the top", () => {
    const ptx = `<page id="page"><button id="top" x="40" y="40" width="360" height="160">A</button><button id="mid" x="40" y="400" width="360" height="160">B</button><button id="far" x="40" y="1800" width="360" height="160">C</button></page>\n`;
    const content = contentBoundsFromPersist({ ptx })!;
    expect(content.y).toBe(40);
    expect(content.h).toBeGreaterThan(1800);
    const thumb = thumbnailViewBox(content);
    expect(thumb.y).toBeLessThan(50);
    expect(thumb.w / thumb.h).toBeGreaterThan(1.4);
    expect(thumb.h).toBeLessThan(content.h * 0.6);
    expect(thumb.y + thumb.h).toBeLessThan(900);
    const preview = sketchPreviewFromPersist({ ptx })!;
    const viewBox = parsePreviewViewBox(preview)!;
    expect(viewBoxFitsContent(viewBox, content)).toBe(false);
    expect(isSketchWireframePreview(preview)).toBe(true);
    expect(previewNeedsRegen(preview, content, "content")).toBe(true);
  });
});
