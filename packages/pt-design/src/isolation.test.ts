import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)));

const FORBIDDEN =
  /@atmos\/(api-types|api-client|hub-client|relay-client|shared)|@workspace\/ui|recharts|from ["']apps\/|@excalidraw\/excalidraw/;

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.includes(".test.")) files.push(p);
  }
  return files;
}

describe("S20 package isolation", () => {
  test("core/cli/mcp do not import api-*/shared/ui/apps/* or browser Excalidraw", () => {
    const files = walk(srcRoot).filter(
      (f) => !f.includes(`${join("src", "embed")}`) && !f.endsWith("index.ts"),
    );
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (FORBIDDEN.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  test("S22 headless graph has no @excalidraw/excalidraw", () => {
    const files = [
      join(srcRoot, "headless.ts"),
      ...walk(join(srcRoot, "core")),
      ...walk(join(srcRoot, "protocol")),
      ...walk(join(srcRoot, "cli")),
      ...walk(join(srcRoot, "mcp")),
      ...walk(join(srcRoot, "agent")),
    ].filter((f) => !f.includes(".test."));
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (text.includes("@excalidraw/excalidraw")) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  test("browser barrel does not import Ink, CLI, MCP, or node:fs", () => {
    const index = readFileSync(join(srcRoot, "index.ts"), "utf8");
    expect(index).not.toMatch(/headless|cli\/bin|mcp\/server|core\/document|from ["']ink["']/);
    const catalog = readFileSync(join(srcRoot, "host", "catalog.ts"), "utf8");
    expect(catalog).not.toContain("@excalidraw/excalidraw");
    const embed = readFileSync(join(srcRoot, "embed", "PtDesignApp.tsx"), "utf8");
    expect(embed).not.toMatch(/headless|cli\/bin|mcp\/server|core\/document|node:fs|from ["']ink["']/);
    expect(embed).toContain("ExcalidrawBoard");
    expect(embed).toContain("chrome.fg");
    expect(embed).toContain("ModeToggle");
    expect(embed).toContain("Palette");
    expect(embed).toContain("OverlayHost");
    expect(embed).toContain("viewModeEnabled");
    expect(embed).toContain("createLiveBoard");
    expect(embed).toContain('captureUpdate: "NEVER"');
    expect(embed).toContain('applyDocument(doc, "NEVER")');
    expect(embed).toContain('"IMMEDIATELY"');
    expect(embed).not.toContain("replaceSession");
    expect(embed).not.toContain("createPtDesignSession");
    expect(embed).not.toContain("createBoardSync");
    expect(embed).not.toContain("translateX(-50%)");
    expect(embed).not.toMatch(/viewBox="0 0 1200 800"/);
    const slideMenuExists = (() => {
      try {
        readFileSync(join(srcRoot, "embed", "motion-slide-menu.tsx"), "utf8");
        return true;
      } catch {
        return false;
      }
    })();
    expect(slideMenuExists).toBe(false);
    const board = readFileSync(join(srcRoot, "embed", "ExcalidrawBoard.tsx"), "utf8");
    expect(board).toMatch(/from ["']@excalidraw\/excalidraw["']/);
    expect(board).toContain("Sidebar");
    expect(board).toContain("Sidebar.TabTrigger");
    expect(board).toContain("pt-design-catalog-tab-component");
    expect(board).toContain("pt-design-catalog-tab-block");
    expect(board).toContain("pt-design-catalog-tab-charts");
    expect(board).toContain("ChartSidebarIcon");
    expect(board).toContain("BlockSidebarIcon");
    expect(board).toContain("pt-design-library-sidebar");
    expect(board).toContain("renderTopRightUI");
    expect(board).toContain("pt-design-top-right");
    expect(board).toContain("pt-design-top-right__actions");
    expect(board).toContain("topLeftChrome");
    expect(board).toContain("iconOnly={isMobile}");
    expect(board).toContain("toggleSidebar");
    expect(board).toContain("pt-design-component-trigger");
    expect(board).toContain("pt-design-library-trigger");
    expect(board).toContain("DefaultSidebar");
    expect(board).not.toContain("Sidebar.Trigger");
    expect(board).toContain("data-testid=\"pt-design-board\"");
    expect(board).toContain("viewModeEnabled");
    expect(board).toContain("captureUpdate");
    expect(board).toContain('captureUpdate: "NEVER"');
  });
});
