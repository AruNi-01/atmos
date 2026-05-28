import { describe, expect, it } from "bun:test";

import {
  MAX_INLINE_APPSHOT_IMAGE_CHARS,
  sanitizePendingPreviewPayload,
  sanitizeRecordDetailPayload,
  toBoundedScreenshotDataUrl,
} from "../lib/appshot-payload";
import type {
  AppshotPendingPreview,
  AppshotRecordDetail,
  AppshotRecordMetadata,
} from "../types";

describe("appshot payload guards", () => {
  it("keeps bounded screenshot payloads renderable", () => {
    expect(toBoundedScreenshotDataUrl("abc")).toBe("data:image/png;base64,abc");
    expect(toBoundedScreenshotDataUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc",
    );
    expect(toBoundedScreenshotDataUrl(null)).toBeNull();
  });

  it("drops oversized pending preview images before storing them in UI state", () => {
    const preview: AppshotPendingPreview = {
      preview_id: "preview-1",
      app_name: "Safari",
      window_title: "Docs",
      captured_at: "2026-05-28T00:00:00Z",
      quality: "screenshot_and_accessibility",
      screenshot_preview_base64: "a".repeat(MAX_INLINE_APPSHOT_IMAGE_CHARS),
      source_bounds: null,
      permissions: [],
      warnings: [],
      expires_in_ms: 6_000,
    };

    const sanitized = sanitizePendingPreviewPayload(preview);

    expect(sanitized.screenshot_preview_base64).toBeNull();
    expect(sanitized.warnings).toContain(
      "Screenshot preview was hidden because the inline image payload is too large.",
    );
  });

  it("drops oversized history thumbnails before storing row details", () => {
    const detail: AppshotRecordDetail = {
      timestamp: "1760000000000",
      metadata: metadata(),
      context_preview: "Window text",
      snapshot_url: `data:image/png;base64,${"a".repeat(MAX_INLINE_APPSHOT_IMAGE_CHARS)}`,
    };

    const sanitized = sanitizeRecordDetailPayload(detail);

    expect(sanitized.snapshot_url).toBeNull();
    expect(sanitized.metadata.warnings).toContain(
      "Screenshot preview was hidden because the inline image payload is too large.",
    );
  });
});

function metadata(): AppshotRecordMetadata {
  return {
    timestamp: "1760000000000",
    captured_at: "2026-05-28T00:00:00Z",
    platform: "macos",
    app_name: "Safari",
    bundle_id: null,
    process_id: null,
    window_title: "Docs",
    window_id: null,
    quality: "screenshot_and_accessibility",
    record_dir: "/Users/example/.atmos/appshots/records/1760000000000",
    snapshot_path:
      "/Users/example/.atmos/appshots/records/1760000000000/snapshot.png",
    context_path:
      "/Users/example/.atmos/appshots/records/1760000000000/context.md",
    metadata_path:
      "/Users/example/.atmos/appshots/records/1760000000000/metadata.json",
    screenshot: {
      available: true,
      width: 1200,
      height: 800,
      media_type: "image/png",
    },
    warnings: [],
    context_bytes: 128,
  };
}
