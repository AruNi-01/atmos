import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve(import.meta.dir, "../src");
const IMPORT_RE = /\b(?:from|import)\s*\(?\s*(["'])@\/([^"']+)\1/g;
const PACKAGE_PREFIX = "@workspace/ui/";

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(next)));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) out.push(next);
  }
  return out;
}

export async function rewriteShadcnAliases(root = SRC): Promise<string[]> {
  const files = await walk(root);
  const changed: string[] = [];
  for (const file of files) {
    const original = await readFile(file, "utf8");
    const next = original.replace(IMPORT_RE, (full, quote: string, spec: string) =>
      full.replace(`${quote}@/${spec}${quote}`, `${quote}${PACKAGE_PREFIX}${spec}${quote}`),
    );
    if (next === original) continue;
    await writeFile(file, next);
    changed.push(file);
  }
  return changed;
}

if (import.meta.main) {
  const changed = await rewriteShadcnAliases();
  for (const file of changed) {
    console.log(`rewrote @/ → @workspace/ui/: ${path.relative(SRC, file)}`);
  }
  console.log(`rewrote ${changed.length} file(s)`);
}
