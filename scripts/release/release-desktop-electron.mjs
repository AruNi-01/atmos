#!/usr/bin/env node
/**
 * Cut a production Atmos Desktop release (Electron ship path).
 *
 * Tag format: desktop-electron-<version>
 * Invoked by `just release-desktop` and `/atmos-desktop-release`.
 *
 *   node scripts/release/release-desktop-electron.mjs 2026.7.28
 *   node scripts/release/release-desktop-electron.mjs 2026.7.28 --dry-run
 */
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureCalendarVersion } from "./lib/calendar-version.mjs";
import { defaultElectronReleaseNotes } from "./electron-release-notes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const TAG_PREFIX = "desktop-electron-";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: opts.capture ? "pipe" : "inherit",
    encoding: "utf8",
    env: process.env,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(err || `${cmd} ${args.join(" ")} failed (${r.status})`);
  }
  return (r.stdout || "").trim();
}

function parseArgs(argv) {
  const positional = [];
  let dryRun = false;
  let prerelease = false;
  let allowDirty = false;
  let skipPush = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--prerelease") prerelease = true;
    else if (arg === "--allow-dirty") allowDirty = true;
    else if (arg === "--skip-push") skipPush = true;
    else if (!arg.startsWith("-")) positional.push(arg);
  }
  return {
    version: positional[0],
    dryRun,
    prerelease,
    allowDirty,
    skipPush,
  };
}

function gitClean() {
  const status = run("git", ["status", "--porcelain"], { capture: true });
  return status.length === 0;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.version) {
    console.error(`Usage: node scripts/release/release-desktop-electron.mjs <YYYY.M.D> [flags]

Flags:
  --dry-run       Print plan only
  --prerelease    Tag with -rc / -beta suffix should already be in version
  --allow-dirty   Allow uncommitted changes
  --skip-push     Commit/tag locally but do not push

Tag: ${TAG_PREFIX}<version>
Workflow: .github/workflows/release-desktop-electron.yml
`);
    process.exit(1);
  }

  const version = ensureCalendarVersion(opts.version, "version");
  if (!opts.prerelease && version.includes("-")) {
    console.warn(
      `Note: version "${version}" looks like a prerelease; workflow will mark GitHub Release as prerelease.`,
    );
  }

  const tag = `${TAG_PREFIX}${version}`;
  const notesDir = resolve(repoRoot, "releasenotes");
  // Prefer product-facing "Atmos Desktop <version>.md"; keep legacy Electron filename as fallback.
  const notesPathPrimary = resolve(notesDir, `Atmos Desktop ${version}.md`);
  const notesPathLegacy = resolve(
    notesDir,
    `Atmos Desktop Electron ${version}.md`,
  );
  const notesPath = existsSync(notesPathLegacy) && !existsSync(notesPathPrimary)
    ? notesPathLegacy
    : notesPathPrimary;

  console.log("=== Atmos Desktop release plan ===");
  console.log(`version:     ${version}`);
  console.log(`tag:         ${tag}`);
  console.log(`notes file:  ${notesPath}`);
  console.log(`dry-run:     ${opts.dryRun}`);
  console.log("");

  if (opts.dryRun) {
    console.log("[dry-run] would bump package.json, write notes stub if missing, commit, tag, push");
    console.log(`[dry-run] would trigger workflow on push of ${tag}`);
    if (!opts.allowDirty && !gitClean()) {
      console.log("[dry-run] note: working tree is currently dirty");
    }
    return;
  }

  if (!opts.allowDirty && !gitClean()) {
    throw new Error(
      "Working tree is dirty. Commit/stash first or pass --allow-dirty.",
    );
  }

  run(process.execPath, [
    resolve(repoRoot, "scripts/release/bump-desktop-electron-version.mjs"),
    version,
  ]);

  if (!existsSync(notesPath)) {
    mkdirSync(notesDir, { recursive: true });
    writeFileSync(
      notesPath,
      defaultElectronReleaseNotes(version, tag),
      "utf8",
    );
    console.log(`✅ Wrote release notes stub: ${notesPath}`);
  }

  run("git", ["add", "apps/desktop-electron/package.json", notesPath]);
  // Only commit if there is something staged
  const staged = run("git", ["diff", "--cached", "--name-only"], {
    capture: true,
  });
  if (staged) {
    run("git", [
      "commit",
      "-m",
      `chore(desktop-electron): release ${version}`,
    ]);
  } else {
    console.log("No staged changes (version may already match).");
  }

  // Fail if tag exists
  const existing = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
    cwd: repoRoot,
  });
  if (existing.status === 0) {
    throw new Error(`Tag already exists: ${tag}`);
  }

  run("git", ["tag", "-a", tag, "-m", `Atmos Desktop Electron ${version}`]);
  console.log(`✅ Created tag ${tag}`);

  if (opts.skipPush) {
    console.log("Skipped push (--skip-push). Push commit + tag when ready.");
    return;
  }

  run("git", ["push", "origin", "HEAD"]);
  run("git", ["push", "origin", tag]);
  console.log(`✅ Pushed ${tag} — watch release-desktop-electron.yml`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
