import { describe, expect, it } from "bun:test";
import { parseCgFrontmostJson } from "./frontmost-cg.ts";

describe("parseCgFrontmostJson", () => {
  it("parses a full CG frontmost payload", () => {
    const fm = parseCgFrontmostJson(
      JSON.stringify({
        ok: true,
        app_name: "QQMusic",
        process_id: 91609,
        window_id: "36971",
        window_title: null,
        x: 68,
        y: 45,
        width: 1402,
        height: 832,
        bundle_id: "com.tencent.QQMusicMac",
        source: "cgwindowlist",
      }),
    );
    expect(fm).not.toBeNull();
    expect(fm!.appName).toBe("QQMusic");
    expect(fm!.processId).toBe(91609);
    expect(fm!.windowId).toBe("36971");
    expect(fm!.width).toBe(1402);
    expect(fm!.height).toBe(832);
    expect(fm!.x).toBe(68);
  });

  it("rejects thin chrome as usable bounds", () => {
    const fm = parseCgFrontmostJson(
      JSON.stringify({
        ok: true,
        app_name: "Ghostty",
        process_id: 1,
        window_id: "2",
        x: 0,
        y: 0,
        width: 1512,
        height: 33,
      }),
    );
    expect(fm).not.toBeNull();
    expect(fm!.width).toBeNull();
    expect(fm!.height).toBeNull();
  });

  it("returns null on ok:false", () => {
    expect(parseCgFrontmostJson('{"ok":false,"error":"no_frontmost_app"}')).toBeNull();
  });
});
