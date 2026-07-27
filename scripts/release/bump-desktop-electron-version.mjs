#!/usr/bin/env node
/**
 * Bump apps/desktop-electron/package.json version (calendar SemVer).
 *
 *   node scripts/release/bump-desktop-electron-version.mjs 2026.7.28
 *   node scripts/release/bump-desktop-electron-version.mjs 2026.7.28 --dry-run
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureCalendarVersion } from "./lib/calendar-version.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");
const packageJsonPath = resolve(
  repoRoot,
  "apps/desktop-electron/package.json",
);

function parseArgs(argv) {
  const positional = [];
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (!arg.startsWith("-")) positional.push(arg);
  }
  return { version: positional[0], dryRun };
}

function main() {
  const { version: raw, dryRun } = parseArgs(process.argv.slice(2));
  if (!raw) {
    console.error(
      "Usage: node scripts/release/bump-desktop-electron-version.mjs <YYYY.M.D> [--dry-run]",
    );
    process.exit(1);
  }
  const version = ensureCalendarVersion(raw, "version");
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const prev = pkg.version;
  pkg.version = version;
  pkg.productName = "Atmos Electron";

  if (dryRun) {
    console.log(`[dry-run] ${packageJsonPath}: ${prev} → ${version}`);
    return;
  }

  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  console.log(`✅ Bumped desktop-electron ${prev} → ${version}`);
}

main();
