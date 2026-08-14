// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CANVAS_KEEP_ALIVE_TTL_MS } from "../CanvasOverlay";

/**
 * Regression: closing Canvas must not unmount CanvasView immediately
 * (that re-triggers dynamic import loading + board hydrate on every open).
 * After {@link CANVAS_KEEP_ALIVE_TTL_MS} warm-hidden, full unmount is OK.
 */
describe("CanvasOverlay keep-alive", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../CanvasOverlay.tsx"),
    "utf8",
  );

  it("keeps CanvasView mounted after first open instead of return-null on idle", () => {
    expect(source).toContain("hasMountedCanvas");
    expect(source).toContain("isKeepAliveHidden");
    expect(source).toContain("data-canvas-keep-alive");
    // Closed idle after first open must not tear down the shell solely via early return null.
    expect(source).not.toMatch(
      /if\s*\(\s*!canvas\s*&&\s*animState\s*===\s*["']idle["']\s*\)\s*\{\s*return\s+null/,
    );
    expect(source).toContain("<CanvasView />");
  });

  it("pauses work while keep-alive hidden via overlay activity context", () => {
    const overlaySource = readFileSync(
      join(import.meta.dirname, "../CanvasOverlay.tsx"),
      "utf8",
    );
    const viewSource = readFileSync(
      join(import.meta.dirname, "../CanvasView.tsx"),
      "utf8",
    );
    expect(overlaySource).toContain("CanvasOverlayActiveContext.Provider");
    expect(overlaySource).toContain("value={!isKeepAliveHidden}");
    expect(viewSource).toContain("useCanvasOverlayActive");
    expect(viewSource).toContain("if (!editorReady || !fileName || !overlayActive) return");
  });

  it("unmounts warm canvas after a one-hour keep-alive TTL", () => {
    expect(CANVAS_KEEP_ALIVE_TTL_MS).toBe(60 * 60 * 1000);
    expect(source).toContain("CANVAS_KEEP_ALIVE_TTL_MS");
    expect(source).toMatch(/setHasMountedCanvas\(false\)/);
  });
});
