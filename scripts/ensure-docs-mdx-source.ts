#!/usr/bin/env bun
/**
 * Ensure fumadocs-mdx wrote a usable `.source/server.ts` before tsc.
 * An empty / comment-only file yields TS2306 ("File is not a module").
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const sourceDir = join(process.cwd(), ".source");
const serverPath = join(sourceDir, "server.ts");

function isUsableServerSource(contents: string): boolean {
  return /export\s+const\s+docs\b/.test(contents);
}

function generate(): void {
  const result = spawnSync("bunx", ["fumadocs-mdx"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

rmSync(sourceDir, { recursive: true, force: true });
generate();

if (!existsSync(serverPath) || !isUsableServerSource(readFileSync(serverPath, "utf8"))) {
  console.error(
    "docs: .source/server.ts is missing or incomplete after fumadocs-mdx; retrying once",
  );
  rmSync(sourceDir, { recursive: true, force: true });
  generate();
}

if (!existsSync(serverPath) || !isUsableServerSource(readFileSync(serverPath, "utf8"))) {
  console.error("docs: .source/server.ts is still missing export const docs");
  process.exit(1);
}
