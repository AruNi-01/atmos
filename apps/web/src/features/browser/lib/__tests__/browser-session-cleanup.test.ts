import { describe, expect, it } from "bun:test";

import {
  omitPreviewBrowserContext,
  sessionIdsForBrowserContext,
} from "../browser-session-cleanup-policy";

describe("browser session cleanup", () => {
  it("omits one Browser panel's persisted tabs without touching others", () => {
    const prefs = {
      byContext: {
        "center-browser:keep": {
          activeTabId: "a",
          tabs: [{ id: "a", url: "https://a.test", activeUrl: "https://a.test" }],
        },
        "center-browser:drop": {
          activeTabId: "b",
          tabs: [{ id: "b", url: "https://b.test", activeUrl: "https://b.test" }],
        },
      },
    };
    expect(omitPreviewBrowserContext(prefs, "center-browser:drop")).toEqual({
      byContext: {
        "center-browser:keep": prefs.byContext["center-browser:keep"],
      },
    });
    const empty = { byContext: {} };
    expect(omitPreviewBrowserContext(empty, "missing")).toBe(empty);
  });

  it("collects every desktop session bound to a Browser panel", () => {
    expect(
      sessionIdsForBrowserContext(
        {
          s1: { contextId: "center-browser:one" },
          s2: { contextId: "center-browser:two" },
          s3: { contextId: "center-browser:one" },
        },
        "center-browser:one",
      ),
    ).toEqual(["s1", "s3"]);
  });
});
