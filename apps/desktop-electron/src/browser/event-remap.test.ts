import { describe, expect, it } from "bun:test";
import {
  buildOpenTabEventPayload,
  gateAndRemapRuntimeEvent,
  openTabTargetFromWindowOpenUrl,
  remapRuntimeEventName,
} from "./runtime-events.ts";

describe("browser runtime-events (shipped pure unit)", () => {
  it("maps atmos-browser:* to desktop-browser:* including open-tab", () => {
    expect(remapRuntimeEventName("atmos-browser:selected")).toBe(
      "desktop-browser:selected",
    );
    expect(remapRuntimeEventName("atmos-browser:navigation-changed")).toBe(
      "desktop-browser:navigation-changed",
    );
    expect(remapRuntimeEventName("atmos-browser:toolbar-action")).toBe(
      "desktop-browser:toolbar-action",
    );
    expect(remapRuntimeEventName("atmos-browser:open-tab")).toBe(
      "desktop-browser:open-tab",
    );
    expect(remapRuntimeEventName("unknown")).toBeNull();
  });

  it("openTabTargetFromWindowOpenUrl only accepts http(s)", () => {
    expect(openTabTargetFromWindowOpenUrl("https://example.com/a")).toBe(
      "https://example.com/a",
    );
    expect(openTabTargetFromWindowOpenUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000/",
    );
    expect(openTabTargetFromWindowOpenUrl("about:blank")).toBeNull();
    expect(openTabTargetFromWindowOpenUrl("javascript:void(0)")).toBeNull();
    expect(openTabTargetFromWindowOpenUrl("")).toBeNull();
    expect(openTabTargetFromWindowOpenUrl(null)).toBeNull();
  });

  it("buildOpenTabEventPayload matches web desktop-transport contract", () => {
    const body = buildOpenTabEventPayload({
      sessionId: "sess-1",
      pageUrl: "https://src.example/",
      targetUrl: "https://dest.example/path",
    });
    expect(body).toEqual({
      type: "atmos-browser:open-tab",
      sessionId: "sess-1",
      pageUrl: "https://src.example/",
      targetUrl: "https://dest.example/path",
    });
    // Remap path used by in-page runtime events
    const remapped = gateAndRemapRuntimeEvent(
      { ...body, bridgeToken: "tok" },
      "tok",
      new Set(["sess-1"]),
    );
    expect(remapped?.channel).toBe("desktop-browser:open-tab");
    expect(remapped?.body.targetUrl).toBe("https://dest.example/path");
  });


  it("rejects unknown session and bad token via gateAndRemapRuntimeEvent", () => {
    const known = new Set(["s1"]);
    expect(
      gateAndRemapRuntimeEvent(
        {
          type: "atmos-browser:selected",
          sessionId: "s1",
          bridgeToken: "wrong",
        },
        "good",
        known,
      ),
    ).toBeNull();
    expect(
      gateAndRemapRuntimeEvent(
        {
          type: "atmos-browser:selected",
          sessionId: "other",
          bridgeToken: "good",
        },
        "good",
        known,
      ),
    ).toBeNull();
  });

  it("accepts good token, strips it, returns remapped channel", () => {
    const out = gateAndRemapRuntimeEvent(
      {
        type: "atmos-browser:selected",
        sessionId: "s1",
        bridgeToken: "good",
        pageUrl: "https://example.com",
      },
      "good",
      new Set(["s1"]),
    );
    expect(out?.channel).toBe("desktop-browser:selected");
    expect(out?.body.bridgeToken).toBeUndefined();
    expect(out?.body.pageUrl).toBe("https://example.com");
  });
});
