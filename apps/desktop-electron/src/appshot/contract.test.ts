import { afterEach, describe, expect, it } from "bun:test";
import {
  appshotStatus,
  buildMacosPermissions,
  dataUrlForPng,
  deleteRecord,
  listRecords,
  MINIMAL_PNG_BYTES,
  readRecords,
  readSnapshot,
  writeTestRecord,
} from "./service.ts";

const ts = `contract-${Date.now()}`;

afterEach(async () => {
  try {
    await deleteRecord(ts);
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

  it("listRecords returns { timestamp, record_dir }", async () => {
    writeTestRecord(ts, "contract");
    const list = await listRecords();
    const item = list.find((r) => r.timestamp === ts);
    expect(item).toBeDefined();
    expect(item?.record_dir).toContain(ts);
    expect(item?.record_dir.length).toBeGreaterThan(ts.length);
  });

  it("readRecords returns AppshotRecordDetail with data:image snapshot_url", async () => {
    writeTestRecord(ts, "detail", { withPng: true });
    const details = await readRecords([ts]);
    expect(details.length).toBe(1);
    const d = details[0]!;
    expect(d.timestamp).toBe(ts);
    expect(d.metadata.record_dir).toContain(ts);
    expect(d.metadata.quality).toBe("screenshot_only");
    expect(d.metadata.platform).toBe("macos");
    expect(typeof d.context_preview).toBe("string");
    // http UI cannot load file:// — must be inline data URL (Tauri parity)
    expect(d.snapshot_url).toBeTruthy();
    expect(d.snapshot_url!.startsWith("data:image/png;base64,")).toBe(true);
    expect(d.snapshot_url!.startsWith("file://")).toBe(false);
    // Round-trip matches helper
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
      productName: "Atmos Electron",
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
    expect(denied[1]!.recovery_action?.target).toBe("screen_recording");

    const both = buildMacosPermissions({
      accessibility: true,
      screenRecording: true,
    });
    expect(both.every((p) => p.granted)).toBe(true);
    expect(both.every((p) => p.recovery_action === null)).toBe(true);

    const screenOnly = buildMacosPermissions({
      accessibility: false,
      screenRecording: true,
    });
    expect(screenOnly.find((p) => p.name === "screen_recording")?.granted).toBe(
      true,
    );
    expect(screenOnly.find((p) => p.name === "accessibility")?.granted).toBe(
      false,
    );
  });
});
