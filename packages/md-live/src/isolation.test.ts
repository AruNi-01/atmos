import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)));

const FORBIDDEN_HOST =
  /@atmos\/(api-types|api-client|hub-client|relay-client|shared)|@workspace\/ui|from ["']apps\//;
const FORBIDDEN_CODEC = /from ["']react["']|from ["']react-dom|@milkdown\/|lucide-react|emoji-mart/;

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.includes(".test.")) files.push(p);
  }
  return files;
}

function isUiFile(file: string): boolean {
  const rel = relative(srcRoot, file);
  return rel === `ui.ts` || rel.startsWith(`ui${sep}`);
}

describe("package isolation", () => {
  test("codec does not import react, milkdown, ui, or apps", () => {
    const hits: string[] = [];
    for (const file of walk(srcRoot)) {
      if (isUiFile(file)) continue;
      const text = readFileSync(file, "utf8");
      if (FORBIDDEN_HOST.test(text) || FORBIDDEN_CODEC.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  test("ui does not import api-*, apps, or @workspace/ui", () => {
    const hits: string[] = [];
    for (const file of walk(srcRoot).filter(isUiFile)) {
      const text = readFileSync(file, "utf8");
      if (FORBIDDEN_HOST.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
