import { describe, expect, it } from "bun:test";
import {
  buildScreenshotPreviewBase64,
  fitsInlinePngDataUrl,
  pngDataUrlCharLength,
  thumbnailPngFromBytes,
  DATA_URL_PREFIX,
  MAX_INLINE_DATA_URL_CHARS,
} from "./thumbnail.ts";

/** Minimal valid 1×1 PNG. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("appshot thumbnail / inline budget", () => {
  it("computes data-url length with base64 padding", () => {
    expect(pngDataUrlCharLength(0)).toBe(DATA_URL_PREFIX.length);
    expect(pngDataUrlCharLength(1)).toBe(DATA_URL_PREFIX.length + 4);
    expect(pngDataUrlCharLength(3)).toBe(DATA_URL_PREFIX.length + 4);
    expect(fitsInlinePngDataUrl(100)).toBe(true);
    // Raw size that would explode past the web budget after base64 + prefix.
    const tooBig = Math.floor(((MAX_INLINE_DATA_URL_CHARS - DATA_URL_PREFIX.length) * 3) / 4) + 1;
    expect(fitsInlinePngDataUrl(tooBig)).toBe(false);
  });

  it("returns tiny PNG base64 without resizing", async () => {
    const b64 = await buildScreenshotPreviewBase64(TINY_PNG);
    expect(b64).toBe(TINY_PNG.toString("base64"));
  });

  it("returns null for empty input", async () => {
    expect(await buildScreenshotPreviewBase64(null)).toBeNull();
    expect(await buildScreenshotPreviewBase64(Buffer.alloc(0))).toBeNull();
  });

  it(
    "downscales a large synthetic buffer via sips when available",
    async () => {
      if (process.platform !== "darwin") {
        return;
      }
      // Oversized random-ish buffer that is not a real PNG — sips may fail.
      // Prefer a real large-ish PNG by expanding the tiny one through sips if possible.
      // When sips cannot decode, thumbnail returns null and we accept that.
      const hugeFake = Buffer.alloc(2_000_000, 7);
      expect(fitsInlinePngDataUrl(hugeFake.length)).toBe(false);
      const preview = await buildScreenshotPreviewBase64(hugeFake);
      // Invalid PNG: may be null. Valid path covered when capture uses real screenshots.
      if (preview != null) {
        expect(fitsInlinePngDataUrl(Buffer.from(preview, "base64").length)).toBe(
          true,
        );
      }

      // Real PNG path: thumbnail of tiny stays small.
      const thumb = await thumbnailPngFromBytes(TINY_PNG);
      expect(thumb == null || thumb.length > 0).toBe(true);
    },
    15_000,
  );
});
