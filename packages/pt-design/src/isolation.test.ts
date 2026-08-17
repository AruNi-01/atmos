import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)));

const FORBIDDEN =
  /@atmos\/(api-types|api-client|hub-client|relay-client|shared)|@workspace\/ui|apps\/cli|@excalidraw\/excalidraw/;

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.includes(".test.")) files.push(p);
  }
  return files;
}

describe("package isolation", () => {
  test("core/cli/mcp do not import forbidden packages or browser Excalidraw", () => {
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

  test("browser barrel does not import Ink, CLI, MCP, or node:fs", () => {
    const index = readFileSync(join(srcRoot, "index.ts"), "utf8");
    expect(index).not.toMatch(/headless|cli\/bin|mcp\/server|core\/document|from ["']ink["']/);
    const embed = readFileSync(join(srcRoot, "embed", "PtDesignApp.tsx"), "utf8");
    expect(embed).not.toMatch(/headless|cli\/bin|mcp\/server|core\/document|node:fs|from ["']ink["']/);
    expect(embed).toContain("ExcalidrawBoard");
    expect(embed).toContain("chrome.fg");
    expect(embed).toContain("ComponentCatalog");
    expect(embed).toContain("catalogPlaceAt");
    expect(embed).toContain("scrollToContent");
    expect(embed).toContain("pt-design-place-reveal");
    expect(embed).not.toMatch(/viewBox="0 0 1200 800"/);
    const catalogPanel = readFileSync(join(srcRoot, "embed", "ComponentCatalog.tsx"), "utf8");
    expect(catalogPanel).toContain("data-testid=\"pt-design-catalog\"");
    expect(catalogPanel).toContain("pt-design-catalog-search");
    expect(catalogPanel).toContain("searchCatalogEntries");
    expect(catalogPanel).toContain("data-kind={kind}");
    expect(catalogPanel).toContain("MotionSlideMenu");
    expect(catalogPanel).toContain("CatalogVariantIcon");
    expect(catalogPanel).not.toContain("block.");
    const slideMenu = readFileSync(join(srcRoot, "embed", "motion-slide-menu.tsx"), "utf8");
    expect(slideMenu).toContain("scrollMemory");
    expect(slideMenu).toContain("scrollTop");
    const board = readFileSync(join(srcRoot, "embed", "ExcalidrawBoard.tsx"), "utf8");
    expect(board).toMatch(/from ["']@excalidraw\/excalidraw["']/);
    expect(board).toContain("Sidebar");
    expect(board).toContain("Sidebar.TabTrigger");
    expect(board).toContain("pt-design-catalog-tab-component");
    expect(board).toContain("pt-design-catalog-tab-block");
    expect(board).toContain("BlockSidebarIcon");
    expect(board).toContain("pt-design-library-sidebar");
    expect(board).toContain("renderTopRightUI");
    expect(board).toContain("toggleSidebar");
    expect(board).toContain("pt-design-component-trigger");
    expect(board).toContain("pt-design-library-trigger");
    expect(board).toContain("DefaultSidebar");
    expect(board).not.toContain("Sidebar.Trigger");
    expect(board).toContain("data-testid=\"pt-design-board\"");
    const session = readFileSync(join(srcRoot, "core", "session.ts"), "utf8");
    expect(session).not.toMatch(/node:fs|from ["']\.\/document["']/);
  });
});
