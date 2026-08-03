import { describe, expect, it } from "bun:test";
import { composeAppshotContext } from "./inspect.ts";
import { buildAppshotContextMarkdownFromParts } from "./context.ts";

describe("Desktop Use inspect context", () => {
  const frontmost = {
    appName: "Notes",
    windowTitle: "Todo",
    bundleId: "com.apple.Notes",
    processId: 99,
    windowId: null,
    x: 0,
    y: 0,
    width: 400,
    height: 300,
  };

  it("composes Appshot Context with UI structure section from tree", () => {
    const { contextMarkdown, quality } = composeAppshotContext(
      frontmost,
      {
        ok: true,
        treeMarkdown: "Button Title: Save\nTextField Value: hello",
        nodeCountEstimate: 2,
        quality: "accessibility",
        warnings: [],
        error: null,
      },
      [],
    );
    expect(contextMarkdown).toContain("# Appshot Context");
    expect(contextMarkdown).toContain("## UI structure");
    expect(contextMarkdown).toContain("Button Title: Save");
    expect(contextMarkdown).toContain("Notes");
    expect(quality).toBe("accessibility");
    expect(contextMarkdown.toLowerCase()).not.toContain("cua");
  });

  it("falls back when tree missing", () => {
    const md = buildAppshotContextMarkdownFromParts({
      frontmost,
      treeMarkdown: "",
      quality: "metadata_only",
      warnings: ["ax empty"],
    });
    expect(md).toContain("Accessibility tree unavailable");
    expect(md).toContain("ax empty");
  });
});
