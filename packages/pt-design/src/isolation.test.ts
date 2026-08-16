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

  test("browser barrel does not import Ink, CLI, or MCP", () => {
    const index = readFileSync(join(srcRoot, "index.ts"), "utf8");
    expect(index).not.toMatch(/headless|cli\/bin|mcp\/server|from ["']ink["']/);
    const embed = readFileSync(join(srcRoot, "embed", "PtDesignApp.tsx"), "utf8");
    expect(embed).not.toMatch(/headless|cli\/bin|mcp\/server|from ["']ink["']/);
  });
});
