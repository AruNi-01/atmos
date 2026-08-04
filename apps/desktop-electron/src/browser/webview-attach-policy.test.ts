import { describe, expect, it } from "bun:test";
import {
  BROWSER_PARTITION,
  consumePendingAttach,
  evaluateWillAttach,
  extractPreferredSessionId,
  forceGuestWebPreferences,
  isAllowedBrowserSrc,
  normalizeBrowserUrl,
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

  it("normalizeBrowserUrl treats origin slash variants as equal", () => {
    expect(normalizeBrowserUrl("https://skills.sh")).toBe(
      normalizeBrowserUrl("https://skills.sh/"),
    );
  });

  it("evaluateWillAttach allows empty src bootstrap when a session is pending", () => {
    const result = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: "",
      registered: [
        {
          sessionId: "s1",
          url: "https://skills.sh/",
          pendingAttach: true,
        },
      ],
    });
    expect(result).toEqual({ allow: true, sessionId: "s1" });
  });

  it("evaluateWillAttach denies empty src when nothing is pending", () => {
    const result = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: "",
      registered: [
        {
          sessionId: "s1",
          url: "https://skills.sh/",
          pendingAttach: false,
        },
      ],
    });
    expect(result.allow).toBe(false);
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

  it("preferredSessionId wins under multi-pending different URLs (no ambiguous DENY)", () => {
    const registered: RegisteredBrowserSession[] = [
      {
        sessionId: "tab-skills",
        url: "https://skills.sh/",
        pendingAttach: true,
      },
      {
        sessionId: "tab-gh",
        url: "https://github.com/remotion-dev/skills",
        pendingAttach: true,
      },
    ];

    // Without preferred id, URL match still picks skills.
    const byUrl = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: "https://skills.sh/",
      registered,
    });
    expect(byUrl).toEqual({ allow: true, sessionId: "tab-skills" });

    // Preferred id binds github even if src were somehow ambiguous.
    const byPref = evaluateWillAttach({
      partition: BROWSER_PARTITION,
      src: "https://skills.sh/",
      preferredSessionId: "tab-gh",
      registered,
    });
    expect(byPref).toEqual({ allow: true, sessionId: "tab-gh" });
  });

  it("extractPreferredSessionId reads data-atmos-session and additionalArguments", () => {
    expect(
      extractPreferredSessionId({
        "data-atmos-session": "sess-1",
      }),
    ).toBe("sess-1");
    expect(
      extractPreferredSessionId(
        {},
        {
          additionalArguments: ["--atmos-browser-session=sess-2"],
        },
      ),
    ).toBe("sess-2");
    expect(extractPreferredSessionId({})).toBeNull();
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
  });
});
