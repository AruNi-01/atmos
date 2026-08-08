import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appshotStatus,
  buildMacosPermissions,
  dataUrlForPng,
  deleteRecord,
  formatProtocolPrompt,
  listRecords,
  MINIMAL_PNG_BYTES,
  readRecords,
  readSnapshot,
  setTestAppshotsRoot,
  writeRecordFromCapture,
  writeTestRecord,
} from "./service.ts";
import { recordsRoot } from "./paths.ts";

let testRoot: string;
const ts = "1760000000999";

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), "atmos-appshot-"));
  setTestAppshotsRoot(testRoot);
});

afterEach(async () => {
  try {
    await deleteRecord(ts);
  } catch {
    /* ignore */
  }
  setTestAppshotsRoot(null);
  try {
    rmSync(testRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("AppShot Electron DTO contract (web-compatible)", () => {
  it("status uses supported + platform macos + trigger + permissions[]", async () => {
    const status = await appshotStatus();
    expect(typeof status.supported).toBe("boolean");
    if (process.platform === "darwin") {
      expect(status.supported).toBe(true);
      expect(status.platform).toBe("macos");
      expect(status.trigger).toBeDefined();
      expect(status.trigger.mode).toBe("macos_modifier_gesture");
      expect(status.trigger.required_modifiers).toEqual([
        "left_shift",
        "right_shift",
      ]);
      expect(Array.isArray(status.permissions)).toBe(true);
      expect(status.permissions.length).toBeGreaterThan(0);
      expect(status.permissions[0]).toMatchObject({
        name: expect.any(String),
        granted: expect.any(Boolean),
        display_name: expect.any(String),
      });
    } else {
      expect(status.supported).toBe(false);
    }
  });

  it("listRecords returns { timestamp, record_dir } under shared appshots root", async () => {
    writeTestRecord(ts, "contract");
    const list = await listRecords();
    const item = list.find((r) => r.timestamp === ts);
    expect(item).toBeDefined();
    expect(item?.record_dir).toContain(ts);
    expect(item?.record_dir).toContain(join(testRoot, "records"));
    expect(recordsRoot()).toBe(join(testRoot, "records"));
  });

  it("readRecords returns AppshotRecordDetail with data:image snapshot_url", async () => {
    writeTestRecord(ts, "detail", { withPng: true, appName: "Safari" });
    const details = await readRecords([ts]);
    expect(details.length).toBe(1);
    const d = details[0]!;
    expect(d.timestamp).toBe(ts);
    expect(d.metadata.record_dir).toContain(ts);
    expect(d.metadata.app_name).toBe("Safari");
    expect(d.metadata.quality).toBe("screenshot_only");
    expect(d.metadata.platform).toBe("macos");
    expect(typeof d.context_preview).toBe("string");
    expect(d.context_preview).toContain("Safari");
    expect(d.snapshot_url).toBeTruthy();
    expect(d.snapshot_url!.startsWith("data:image/png;base64,")).toBe(true);
    expect(d.snapshot_url!.startsWith("file://")).toBe(false);
    expect(d.snapshot_url).toBe(dataUrlForPng(MINIMAL_PNG_BYTES));
  });

  it("readSnapshot returns usable data URL for renderer", async () => {
    writeTestRecord(ts, "snap", { withPng: true });
    const snap = await readSnapshot(ts);
    expect(snap.timestamp).toBe(ts);
    expect(snap.snapshot_url.startsWith("data:image/png;base64,")).toBe(true);
    expect(snap.snapshot_url.startsWith("file://")).toBe(false);
  });

  it("buildMacosPermissions reflects grant flags (not hardcoded stubs)", () => {
    const denied = buildMacosPermissions({
      accessibility: false,
      screenRecording: false,
      productName: "Atmos",
    });
    expect(denied).toHaveLength(2);
    expect(denied[0]).toMatchObject({
      name: "accessibility",
      granted: false,
    });
    expect(denied[0]!.recovery_action).toMatchObject({
      label: "Grant",
      target: "accessibility",
    });
    expect(denied[1]).toMatchObject({
      name: "screen_recording",
      granted: false,
    });

    const both = buildMacosPermissions({
      accessibility: true,
      screenRecording: true,
    });
    expect(both.every((p) => p.granted)).toBe(true);
    expect(both.every((p) => p.recovery_action === null)).toBe(true);
  });

  it("buildMacosPermissions names host product for dual-shift and capture", () => {
    const perms = buildMacosPermissions({
      accessibility: false,
      screenRecording: false,
      accessibilityProduct: "Atmos Desktop Use",
      screenRecordingProduct: "Atmos Desktop Use",
    });
    expect(perms[0]!.recovery_action?.manual_steps.join(" ")).toContain(
      "Atmos Desktop Use",
    );
    expect(perms[0]!.recovery_action?.manual_steps.join(" ")).toContain(
      "Left⇧+Right⇧",
    );
    expect(perms[1]!.recovery_action?.manual_steps.join(" ")).toContain(
      "Atmos Desktop Use",
    );
  });

  it("writeRecordFromCapture uses protocol + real app metadata", () => {
    const written = writeRecordFromCapture({
      previewId: "pv",
      appName: "Notes",
      windowTitle: "Todo",
      capturedAt: new Date().toISOString(),
      quality: "screenshot_only",
      screenshotPng: MINIMAL_PNG_BYTES,
      screenshotPreviewBase64: null,
      contextMarkdown: "# Appshot Context\n\n- App: Notes\n",
      sourceBounds: { x: 0, y: 0, width: 100, height: 80 },
      permissions: [],
      warnings: [],
      bundleId: "com.apple.Notes",
      processId: 1,
      windowId: null,
      platform: "macos",
    });
    expect(written.metadata.app_name).toBe("Notes");
    expect(written.metadata.window_title).toBe("Todo");
    expect(written.protocol_text).toBe(formatProtocolPrompt(written.timestamp));
    expect(written.protocol_text).toContain("atmos://appshots/");
    expect(written.protocol_text).toContain("~/.atmos/appshots/records/");
  });
});
