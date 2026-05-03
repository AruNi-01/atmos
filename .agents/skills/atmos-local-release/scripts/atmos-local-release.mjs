#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../..");

const DEFAULTS = {
  prerelease: false,
  dryRun: false,
  allowDirty: false,
  build: true,
  createTag: true,
  pushTag: true,
  monitor: false,
};

function printUsage() {
  console.log(`Atmos local runtime release helper

Usage:
  node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs <version> [options]

Examples:
  node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs 0.1.0
  node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs 0.2.0-rc.1 --prerelease
  node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs 0.1.0 --dry-run

Options:
  --prerelease           Mark release intent as prerelease
  --dry-run              Preview actions without mutating git state
  --allow-dirty          Allow release from a dirty working tree
  --no-build             Skip local runtime build preflight
  --no-tag               Do not create the local runtime tag
  --no-push-tag          Do not push the local runtime tag
  --monitor              Show GitHub CLI commands to inspect release state after push
  --help, -h             Show this help

This script is Atmos-specific and assumes:
- local runtime tag format: local-v<version>
- version files:
  - packages/local-installer/package.json
- release workflow: .github/workflows/release-local-runtime.yml
- runtime build script: scripts/local-runtime/build-runtime.mjs
- version check script: scripts/release/check-local-runtime-version.mjs
`);
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`ℹ️  ${message}`);
}

function success(message) {
  console.log(`✅ ${message}`);
}

function parseArgs(argv) {
  const args = {
    version: "",
    ...DEFAULTS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (!arg.startsWith("-") && !args.version) {
      args.version = arg;
      continue;
    }

    switch (arg) {
      case "--prerelease":
        args.prerelease = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--allow-dirty":
        args.allowDirty = true;
        break;
      case "--no-build":
        args.build = false;
        break;
      case "--no-tag":
        args.createTag = false;
        break;
      case "--no-push-tag":
        args.pushTag = false;
        break;
      case "--monitor":
        args.monitor = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.version) {
    printUsage();
    process.exit(1);
  }

  return args;
}

function ensureValidVersion(version) {
  const normalized = String(version || "").trim();
  const VERSION_RE =
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

  if (!VERSION_RE.test(normalized)) {
    fail(
      `Invalid version "${normalized}". Expected something like 0.1.0 or 0.2.0-rc.1`,
    );
  }

  return normalized;
}

function buildLocalTag(version) {
  return `local-v${version}`;
}

function sh(command, args = [], options = {}) {
  const { allowFailure = false, capture = true } = options;

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    env: {
      ...process.env,
    },
  });

  if (result.error) {
    fail(`Failed to run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0 && !allowFailure) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const detail = stderr || stdout || `exit code ${result.status}`;
    fail(`${command} ${args.join(" ")} failed: ${detail}`);
  }

  return {
    status: result.status ?? 0,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function shellEscape(value) {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function runOrPrint(cmd, args, { dryRun, description } = {}) {
  const prettyCommand = [cmd, ...args].map(shellEscape).join(" ");

  if (description) {
    info(description);
  }

  if (dryRun) {
    console.log(`[dry-run] ${prettyCommand}`);
    return { status: 0, stdout: "", stderr: "" };
  }

  return sh(cmd, args, { capture: false });
}

function ensureGitRepo() {
  const inside = sh("git", ["rev-parse", "--is-inside-work-tree"]).stdout;
  if (inside !== "true") {
    fail("Current directory is not a git repository.");
  }
}

function ensureWorkingTreeClean(allowDirty) {
  const status = sh("git", ["status", "--short"]).stdout;
  if (!status || allowDirty) {
    return;
  }
  fail(
    "Working tree is dirty. Commit or stash changes first, or rerun with --allow-dirty.",
  );
}

function ensureGhAuth() {
  const result = sh("gh", ["auth", "status"], { allowFailure: true });
  if (result.status !== 0) {
    fail("GitHub CLI authentication is required. Run `gh auth login` first.");
  }
}

function ensureTagDoesNotExist(tag) {
  const local = sh("git", ["tag", "--list", tag]).stdout;
  if (local === tag) {
    fail(`Local tag ${tag} already exists.`);
  }

  const remote = sh("git", ["ls-remote", "--tags", "origin", tag], {
    allowFailure: true,
  }).stdout;
  if (remote) {
    fail(`Remote tag ${tag} already exists on origin.`);
  }
}

function printMonitorGuidance(tag) {
  console.log("");
  info("Monitor the publish workflow with:");
  console.log(`  gh run list --workflow release-local-runtime.yml --limit 5`);
  console.log(`  gh release view ${tag}`);
  console.log("");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = ensureValidVersion(args.version);
  const tag = buildLocalTag(version);

  ensureGitRepo();
  ensureWorkingTreeClean(args.allowDirty);
  ensureGhAuth();

  info(`Preparing Atmos local runtime release ${version}`);
  info(`Target tag: ${tag}`);
  if (args.prerelease) {
    info("Release intent is prerelease.");
  }

  runOrPrint(
    "node",
    ["./scripts/release/check-local-runtime-version.mjs", "--release-tag", tag],
    {
      dryRun: false,
      description: "Validating local runtime version alignment",
    },
  );

  if (args.build) {
    runOrPrint("node", ["./scripts/local-runtime/build-runtime.mjs"], {
      dryRun: args.dryRun,
      description: "Building local runtime archive as preflight",
    });
  } else {
    info("Skipping local runtime build preflight.");
  }

  if (args.createTag) {
    ensureTagDoesNotExist(tag);
    runOrPrint("git", ["tag", tag], {
      dryRun: args.dryRun,
      description: `Creating tag ${tag}`,
    });
  } else {
    info("Skipping tag creation.");
  }

  if (args.pushTag) {
    runOrPrint("git", ["push", "origin", tag], {
      dryRun: args.dryRun,
      description: `Pushing tag ${tag}`,
    });
  } else {
    info("Skipping tag push.");
  }

  if (args.monitor || args.dryRun) {
    printMonitorGuidance(tag);
  }

  success(`Local runtime release preflight complete for ${tag}`);
}

main();
