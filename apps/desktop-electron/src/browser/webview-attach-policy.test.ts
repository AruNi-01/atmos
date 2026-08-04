import { describe, expect, it } from "bun:test";
import {
  BROWSER_PARTITION,
  consumePendingAttach,
  evaluateWillAttach,
  forceGuestWebPreferences,
  isAllowedBrowserSrc,
  toPreloadFileUrl,
  type RegisteredBrowserSession,
} from "./webview-attach-policy.ts";

describe("webview-attach-policy (APP-053)", () => {
  it("isAllowedBrowserSrc accepts http(s) and about:blank only", () => {
    expect(isAllowedBrowserSrc("https://example.com/x")).toBe(true);
    expect(isAllowedBrowserSrc("http://localhost:3000/")).toBe(true);
    expect(isAllowedBrowserSrc("about:blank")).toBe(true);
    expect(isAllowedBrowserSrc("javascript:alert(1)")).toBe(false);
    expect(isAllowedBrowserSrc("file:///tmp/x")).toBe(false);
    expect(isAllowedBrowserSrc("")).toBe(false);
  });

  it("evaluateWillAttach allows registered pending session with matching partition+url", () => {
    const result = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: "https://example.com/app",
      registered: [
        {
          sessionId: "s1",
          url: "https://example.com/app",
          pendingAttach: true,
        },
      ],
    });
    expect(result).toEqual({ allow: true, sessionId: "s1" });
  });

  it("evaluateWillAttach denies wrong partition", () => {
    const result = evaluateWillAttach({
      partition: "persist:evil",
      src: "https://example.com/",
      registered: [
        { sessionId: "s1", url: "https://example.com/", pendingAttach: true },
      ],
    });
    expect(result.allow).toBe(false);
  });

  it("evaluateWillAttach denies when nothing is registered", () => {
    const result = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: "https://example.com/",
      registered: [],
    });
    expect(result.allow).toBe(false);
  });

  it("evaluateWillAttach denies javascript src even if registered", () => {
    const result = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: "javascript:void(0)",
      registered: [
        { sessionId: "s1", url: "javascript:void(0)", pendingAttach: true },
      ],
    });
    expect(result.allow).toBe(false);
  });

  it("forceGuestWebPreferences forces sandbox isolation and preload path", () => {
    const prefs: Record<string, unknown> = {
      nodeIntegration: true,
      sandbox: false,
      contextIsolation: false,
      preloadURL: "http://evil",
    };
    forceGuestWebPreferences(prefs, "/abs/browser-preload.cjs");
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.preload).toBe("/abs/browser-preload.cjs");
    expect(prefs.preloadURL).toBeUndefined();
  });

  it("toPreloadFileUrl returns absolute file:// URL", () => {
    const url = toPreloadFileUrl("/Users/me/app/browser-preload.cjs");
    expect(url.startsWith("file://")).toBe(true);
    expect(url).toContain("/Users/me/app/browser-preload.cjs");
    expect(toPreloadFileUrl("file:///already")).toBe("file:///already");
  });

  it("two pending sessions with the same URL bind FIFO after consume (not both to first)", () => {
    const sameUrl = "https://example.com/shared";
    let registered: RegisteredBrowserSession[] = [
      { sessionId: "tab-a", url: sameUrl, pendingAttach: true },
      { sessionId: "tab-b", url: sameUrl, pendingAttach: true },
    ];

    const first = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: sameUrl,
      registered,
    });
    expect(first).toEqual({ allow: true, sessionId: "tab-a" });

    // Manager must consume pending on allow (markAttachAllowed parity).
    registered = consumePendingAttach(registered, "tab-a");
    expect(registered.find((s) => s.sessionId === "tab-a")?.pendingAttach).toBe(
      false,
    );
    expect(registered.find((s) => s.sessionId === "tab-b")?.pendingAttach).toBe(
      true,
    );

    const second = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: sameUrl,
      registered,
    });
    expect(second).toEqual({ allow: true, sessionId: "tab-b" });

    // Without consume, both evaluates would return tab-a (regression guard).
    const stale = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: sameUrl,
      registered: [
        { sessionId: "tab-a", url: sameUrl, pendingAttach: true },
        { sessionId: "tab-b", url: sameUrl, pendingAttach: true },
      ],
    });
    expect(stale).toEqual({ allow: true, sessionId: "tab-a" });
  });
});
