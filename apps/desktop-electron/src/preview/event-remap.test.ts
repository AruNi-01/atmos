import { describe, expect, it } from "bun:test";
import {
  gateAndRemapRuntimeEvent,
  remapRuntimeEventName,
} from "./runtime-events.ts";

describe("preview runtime-events (shipped pure unit)", () => {
  it("maps atmos-preview:* to desktop-preview:*", () => {
    expect(remapRuntimeEventName("atmos-preview:selected")).toBe(
      "desktop-preview:selected",
    );
    expect(remapRuntimeEventName("atmos-preview:navigation-changed")).toBe(
      "desktop-preview:navigation-changed",
    );
    expect(remapRuntimeEventName("atmos-preview:toolbar-action")).toBe(
      "desktop-preview:toolbar-action",
    );
    expect(remapRuntimeEventName("unknown")).toBeNull();
  });

  it("rejects unknown session and bad token via gateAndRemapRuntimeEvent", () => {
    const known = new Set(["s1"]);
    expect(
      gateAndRemapRuntimeEvent(
        {
          type: "atmos-preview:selected",
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
          type: "atmos-preview:selected",
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
        type: "atmos-preview:selected",
        sessionId: "s1",
        bridgeToken: "good",
        pageUrl: "https://example.com",
      },
      "good",
      new Set(["s1"]),
    );
    expect(out?.channel).toBe("desktop-preview:selected");
    expect(out?.body.bridgeToken).toBeUndefined();
    expect(out?.body.pageUrl).toBe("https://example.com");
  });
});
