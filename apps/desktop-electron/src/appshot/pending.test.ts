import { describe, expect, it } from "bun:test";
import {
  PendingStore,
  PREVIEW_EXPIRES_IN_MS,
  type PendingCapture,
} from "./pending.ts";

function sampleCapture(
  overrides: Partial<PendingCapture> = {},
): PendingCapture {
  return {
    previewId: "p1",
    appName: "Notes",
    windowTitle: "Shopping",
    capturedAt: new Date().toISOString(),
    quality: "screenshot_only",
    screenshotPng: Buffer.from([1, 2, 3]),
    screenshotPreviewBase64: "abc",
    contextMarkdown: "# Appshot Context\n",
    sourceBounds: null,
    permissions: [{ name: "screen_recording", granted: true }],
    warnings: [],
    bundleId: "com.apple.Notes",
    processId: 42,
    windowId: null,
    platform: "macos",
    ...overrides,
  };
}

describe("PendingStore auto-accept", () => {
  it("is not a permanent no-op: becomes ready after grace window", () => {
    const store = new PendingStore();
    const now = 1_000_000;
    store.insert(sampleCapture(), now);
    expect(store.autoAcceptState("p1", now).kind).toBe("wait");
    expect(
      store.autoAcceptState("p1", now + PREVIEW_EXPIRES_IN_MS + 600).kind,
    ).toBe("ready");
  });

  it("hold blocks ready; resume schedules later ready", () => {
    const store = new PendingStore();
    const now = 2_000_000;
    store.insert(sampleCapture(), now);
    store.setAutoAcceptHold("p1", true, null, now);
    expect(store.autoAcceptState("p1", now + 60_000).kind).toBe("held");
    store.setAutoAcceptHold("p1", false, 1_000, now + 60_000);
    expect(store.autoAcceptState("p1", now + 60_000).kind).toBe("wait");
    expect(store.autoAcceptState("p1", now + 60_000 + 2_000).kind).toBe(
      "ready",
    );
  });

  it("take removes pending entry", () => {
    const store = new PendingStore();
    store.insert(sampleCapture());
    expect(store.take("p1")?.capture.appName).toBe("Notes");
    expect(store.get("p1")).toBeUndefined();
    expect(store.autoAcceptState("p1").kind).toBe("missing");
  });
});
