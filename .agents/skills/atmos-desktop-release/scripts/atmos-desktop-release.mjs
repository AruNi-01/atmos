#!/usr/bin/env node
/**
 * Production Atmos desktop release entrypoint.
 * Delegates to the Electron ship path (scripts/release/release-desktop-electron.mjs).
 * Deprecated Tauri release automation is no longer used.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const electronRelease = resolve(
  repoRoot,
  "scripts/release/release-desktop-electron.mjs",
);

function printUsage() {
  console.log(`Atmos desktop release helper (production)

Usage:
  node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version> [options]

Examples:
  node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs 2026.7.2
  node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs 2026.7.2-rc.1 --prerelease
  node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs 2026.7.2 --dry-run

Options (forwarded):
  --prerelease
  --dry-run
  --allow-dirty
  --skip-push
  --help, -h

Tag format: desktop-electron-<version>
Workflow: .github/workflows/release-desktop-electron.yml
Version file: apps/desktop-electron/package.json
`);
}

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
  printUsage();
  process.exit(argv.length === 0 ? 1 : 0);
}

// Map skill flags to electron release script flags
const forwarded = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--no-push-tag" || a === "--no-push-commit" || a === "--no-tag" || a === "--no-commit") {
    // electron script uses --skip-push for "no remote push"
    if (!forwarded.includes("--skip-push")) forwarded.push("--skip-push");
    continue;
  }
  if (a === "--branch" || a === "--monitor") {
    // not supported by electron path; skip value
    if (a === "--branch") i += 1;
    continue;
  }
  forwarded.push(a);
}

const r = spawnSync(process.execPath, [electronRelease, ...forwarded], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
