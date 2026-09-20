import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHostShiftLine } from "./host-shift-protocol.ts";

describe("host inject AppShot socket lines", () => {
  it("parses captured window payloads", () => {
    const parsed = parseHostShiftLine(
      JSON.stringify({
        t: "captured",
        app_name: "Notes",
        bundle_id: "com.apple.Notes",
        process_id: 42,
        window_id: 99,
        window_title: "Todo",
        x: 10,
        y: 20,
        width: 800,
        height: 600,
        png_path: "/tmp/host.png",
        quality: "window",
      }),
    );
    expect(parsed).toMatchObject({
      t: "captured",
      app_name: "Notes",
      bundle_id: "com.apple.Notes",
      process_id: 42,
      window_id: 99,
      png_path: "/tmp/host.png",
      width: 800,
      height: 600,
    });
  });

  it("parses need_grant and ignored without treating chord as a capture", () => {
    expect(parseHostShiftLine('{"t":"need_grant","missing":["screen_recording"]}')).toEqual({
      t: "need_grant",
      missing: ["screen_recording"],
    });
    expect(parseHostShiftLine('{"t":"ignored","reason":"self"}')).toEqual({
      t: "ignored",
      reason: "self",
    });
    expect(parseHostShiftLine('{"t":"chord"}')).toEqual({ t: "chord" });
    expect(parseHostShiftLine('{"t":"ready","ax":true,"tap":false}')).toEqual({
      t: "ready",
      ax: true,
      tap: false,
    });
  });

  it("rejects captured lines that cannot be staged", () => {
    expect(parseHostShiftLine('{"t":"captured","app_name":"Notes"}')).toEqual({
      t: "ignored",
      reason: "bad_captured",
    });
  });
});

describe("host inject capture wiring", () => {
  it("captures in the Desktop Use inject dylib without system TCC prompts", () => {
    const native = readFileSync(
      join(import.meta.dir, "../../native/appshot-shift/appshot_shift.c"),
      "utf8",
    );
    const capture = readFileSync(
      join(import.meta.dir, "../../native/appshot-shift/appshot_window_capture.m"),
      "utf8",
    );
    const header = readFileSync(
      join(import.meta.dir, "../../native/appshot-shift/appshot_window_capture.h"),
      "utf8",
    );
    expect(header).toContain("atmos_appshot_host_capture_now");
    expect(native).toContain("atmos_appshot_host_capture_now");
    expect(native).toContain("host_capture_thread");
    expect(native).not.toContain('host_shift_broadcast("{\\"t\\":\\"chord\\"}');
    expect(capture).toContain("CGPreflightScreenCaptureAccess");
    expect(capture).toContain("SCScreenshotManager");
    expect(capture).toContain("CGWindowListCreateImage");
    expect(capture).not.toContain("CGRequestScreenCaptureAccess");
    expect(capture).not.toContain("AXIsProcessTrustedWithOptions");
    expect(capture).not.toContain("kAXTrustedCheckOptionPrompt");
    expect(native).toContain("{\"t\":\"captured\"");
  });

  it("Electron stages host PNGs and opens the drag overlay on need_grant", () => {
    const service = readFileSync(join(import.meta.dir, "service.ts"), "utf8");
    const tap = readFileSync(join(import.meta.dir, "trigger-event-tap.ts"), "utf8");
    const trigger = readFileSync(join(import.meta.dir, "trigger.ts"), "utf8");
    const grant = readFileSync(
      join(import.meta.dir, "../desktop-use/host-grant.ts"),
      "utf8",
    );
    expect(service).toContain("stageHostCapturedPreview");
    expect(service).toContain("openDesktopUseGrantFlow");
    expect(service).toContain("handleAppshotNeedGrant");
    expect(service).not.toContain("CGRequestScreenCaptureAccess");
    expect(tap).toContain("onHostCaptured");
    expect(tap).toContain("restartHostForStaleChord");
    expect(trigger).toContain("onHostCaptured");
    expect(grant).toContain("showAccessibilityGrantOverlay");
    expect(grant).toContain("desktopUseDriverRestart");
    expect(grant).not.toContain("CGRequestScreenCaptureAccess");
    expect(grant).not.toContain("isTrustedAccessibilityClient(true)");
  });
});
