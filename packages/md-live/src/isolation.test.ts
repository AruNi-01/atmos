import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)));

const FORBIDDEN =
  /@atmos\/(api-types|api-client|hub-client|relay-client|shared)|@workspace\/ui|from ["']apps\//;

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
  test("does not import api-*, apps, ui, or shared", () => {
    const hits: string[] = [];
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, "utf8");
      if (FORBIDDEN.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
