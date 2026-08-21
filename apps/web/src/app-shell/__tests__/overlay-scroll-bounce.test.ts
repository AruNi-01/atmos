import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("overlay scroll bounce (macOS rubber-banding)", () => {
  it("does not force classic webkit scrollbar widths on every scroller", () => {
    const css = read("apps/web/src/app/globals.css");
    expect(css).not.toMatch(/\*::-webkit-scrollbar\s*\{[^}]*\bwidth\s*:/);
    expect(css).not.toMatch(/\*::-webkit-scrollbar\s*\{[^}]*\bheight\s*:/);
    expect(css).toContain("scrollbar-color:");
    expect(css).toContain("scrollbar-width: auto");
    expect(css).toContain(".agent-chat-scroll");
    expect(css).toContain("scrollbar-gutter: auto !important");

    const terminalCss = read(
      "apps/web/src/features/terminal/components/terminal-grid.css",
    );
    expect(terminalCss).not.toMatch(
      /\.terminal-grid-container\s+::-webkit-scrollbar\s*\{[^}]*\bwidth\s*:/,
    );
  });

  it("does not force a classic CodeMirror scroller", () => {
    const src = read(
      "apps/web/src/features/editor/components/BaseCodeMirrorEditor.tsx",
    );
    expect(src).not.toMatch(/\.cm-scroller::-webkit-scrollbar['"]\s*:\s*\{[^}]*width/);
    expect(src).toContain("scrollbarWidth: 'auto'");
  });

  it("enables Electron scrollBounce on product windows", () => {
    const main = read("apps/desktop-electron/src/windows/main-window.ts");
    const secondary = read("apps/desktop-electron/src/windows/secondary.ts");
    expect(main).toContain("scrollBounce: true");
    expect(secondary).toContain("scrollBounce: true");
  });
});
