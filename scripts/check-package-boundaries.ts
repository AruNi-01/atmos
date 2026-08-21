/**
 * Cheap package boundary check (APP-050 M11).
 * Fails if packages/shared (outside allowlist) imports api-client/api-types
 * or defines main-app WS frame/action authorities.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const sharedSrc = join(root, "packages/shared/src");

const ALLOW_DIRS = new Set(["terminal", "preview", "debug"]);

const ILLEGAL_IMPORT =
  /from\s+["']@atmos\/(api-client|api-types)(\/[^"']*)?["']|require\(["']@atmos\/(api-client|api-types)/;
const ILLEGAL_AUTHORITY =
  /export\s+type\s+WsAction\b|export\s+interface\s+WsRequest\b|export\s+type\s+WsRequest\b|export\s+interface\s+WsResponse\b|export\s+type\s+WsResponse\b/;

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const rel = relative(sharedSrc, p).split(/[/\\]/)[0] ?? "";
      if (ALLOW_DIRS.has(rel) && relative(sharedSrc, p) === rel) {
        // skip entire allowlisted top-level dir
        continue;
      }
      if (ALLOW_DIRS.has(rel)) {
        // inside allowlisted tree — skip
        const top = relative(sharedSrc, p).split(/[/\\]/)[0];
        if (top && ALLOW_DIRS.has(top)) continue;
      }
      // re-check: if path starts with allowlisted segment, skip
      const parts = relative(sharedSrc, p).split(/[/\\]/);
      if (parts[0] && ALLOW_DIRS.has(parts[0])) continue;
      walk(p, files);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name) && !name.endsWith(".test.ts")) {
      files.push(p);
    }
  }
  return files;
}

function isAllowlisted(file: string): boolean {
  const rel = relative(sharedSrc, file);
  const top = rel.split(/[/\\]/)[0];
  return Boolean(top && ALLOW_DIRS.has(top));
}

const files = walk(sharedSrc).filter((f) => !isAllowlisted(f));
const violations: string[] = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (ILLEGAL_IMPORT.test(text)) {
    violations.push(`${relative(root, file)}: illegal api-types/api-client import`);
  }
  if (ILLEGAL_AUTHORITY.test(text)) {
    violations.push(`${relative(root, file)}: main-app WS authority type export`);
  }
}

const ptDesignSrc = join(root, "packages/pt-design/src");
const PT_FORBIDDEN =
  /from\s+["']@atmos\/(api-types|api-client|hub-client|relay-client|shared)(\/[^"']*)?["']|from\s+["']@workspace\/ui["']|apps\/cli/;
const PT_EXCALIDRAW =
  /from\s+["']@excalidraw\/excalidraw["']/;

function walkPt(dir: string, files: string[] = []): string[] {
  if (!existsSyncSafe(dir)) return files;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkPt(p, files);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) {
      files.push(p);
    }
  }
  return files;
}

function existsSyncSafe(dir: string): boolean {
  try {
    statSync(dir);
    return true;
  } catch {
    return false;
  }
}

const ptFiles = walkPt(ptDesignSrc);
for (const file of ptFiles) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");
  if (PT_FORBIDDEN.test(text)) {
    violations.push(`${rel}: illegal Atmos product-package import`);
  }
  if (PT_EXCALIDRAW.test(text) && !rel.includes("/embed/")) {
    violations.push(`${rel}: headless path must not import Excalidraw browser bundle`);
  }
}

if (violations.length) {
  console.error("Package boundary violations:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}

console.log(
  `OK: checked ${files.length} shared files (allowlist: ${[...ALLOW_DIRS].join(", ")}) and ${ptFiles.length} pt-design files`,
);
