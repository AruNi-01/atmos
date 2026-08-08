import { describe, expect, it } from "bun:test";
import {
  buildContextMarkdown,
  parseFrontmostScriptOutput,
} from "./frontmost.ts";

describe("frontmost parsing + context", () => {
  it("parses System Events script output into real app/window metadata", () => {
    const fm = parseFrontmostScriptOutput(
      "Safari\nGitHub\n10,20,800,600\n1234\n",
    );
    expect(fm.appName).toBe("Safari");
    expect(fm.windowTitle).toBe("GitHub");
    expect(fm.x).toBe(10);
    expect(fm.y).toBe(20);
    expect(fm.width).toBe(800);
    expect(fm.height).toBe(600);
    expect(fm.processId).toBe(1234);
  });

  it("keeps negative multi-monitor origins for source_bounds / animation", () => {
    const fm = parseFrontmostScriptOutput(
      "Notes\nShopping\n-1440,100,1280,800\n42\n",
    );
    expect(fm.x).toBe(-1440);
    expect(fm.y).toBe(100);
    expect(fm.width).toBe(1280);
    expect(fm.height).toBe(800);
  });

  it("rejects thin chrome strips (first-window title bars) as bounds", () => {
    const fm = parseFrontmostScriptOutput("Ghostty\n\n0,0,1512,33\n27354\n");
    expect(fm.appName).toBe("Ghostty");
    expect(fm.width).toBeNull();
    expect(fm.height).toBeNull();
    expect(fm.x).toBeNull();
    expect(fm.y).toBeNull();
  });

  it("context markdown names the captured app/window (not Atmos placeholders)", () => {
    const md = buildContextMarkdown(
      {
        appName: "Notes",
        windowTitle: "Shopping list",
        bundleId: "com.apple.Notes",
        processId: 99,
        windowId: null,
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      },
      [],
    );
    expect(md).toContain("Notes");
    expect(md).toContain("Shopping list");
    expect(md).not.toMatch(/App: Atmos\b/);
    expect(md).not.toContain("Screenshot");
  });
});
