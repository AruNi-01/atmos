#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../..");

const DEFAULTS = {
  prerelease: false,
  dryRun: false,
  branch: "main",
  commit: true,
  pushCommit: true,
  createTag: true,
  pushTag: true,
  monitor: false,
  allowDirty: false,
};

function printUsage() {
  console.log(`Atmos desktop release helper

Usage:
  node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs <version> [options]

Examples:
  node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs 0.2.1
  node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs 0.5.0-rc.1 --prerelease
  node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs 0.2.1 --dry-run
  node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs 0.2.1 --no-commit --no-push-commit

Options:
  --prerelease           Mark release intent as prerelease
  --dry-run              Preview actions without mutating git state
  --branch <name>        Branch to push release-prep commit to (default: main)
  --allow-dirty          Allow release from a dirty working tree
  --no-commit            Do not create a version-bump commit
  --no-push-commit       Do not push the release-prep commit
  --no-tag               Do not create the desktop tag
  --no-push-tag          Do not push the desktop tag
  --monitor              Show GitHub CLI commands to inspect release state after push
  --help, -h             Show this help

This script is Atmos-specific and assumes:
- desktop tag format: desktop-v<version>
- version files:
  - apps/desktop/src-tauri/Cargo.toml
  - apps/desktop/src-tauri/tauri.conf.json
  - apps/desktop/package.json
- release workflow: .github/workflows/release-desktop.yml
- tap sync workflow: .github/workflows/sync-homebrew-tap.yml
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

function warn(message) {
  console.warn(`⚠️  ${message}`);
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
      case "--no-commit":
        args.commit = false;
        break;
      case "--no-push-commit":
        args.pushCommit = false;
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
      case "--branch": {
        const value = argv[i + 1];
        if (!value) fail("Missing value for --branch");
        args.branch = value;
        i += 1;
        break;
      }
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
      `Invalid version "${normalized}". Expected something like 0.2.1 or 0.5.0-rc.1`,
    );
  }

  return normalized;
}

function buildDesktopTag(version) {
  return `desktop-v${version}`;
}

function buildReleaseNotesPath(version) {
  return sh("node", ["./scripts/release/desktop-release-notes.mjs", "--version", version]).stdout;
}

function sh(command, args = [], options = {}) {
  const { allowFailure = false, capture = true, extraEnv = {} } = options;

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    env: {
      ...process.env,
      ...extraEnv,
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

function runOrPrint(cmd, args, { dryRun, description, extraEnv = {} } = {}) {
  const prettyEnv = Object.entries(extraEnv)
    .map(([key, value]) => `${key}=${shellEscape(String(value))}`)
    .join(" ");
  const prettyCommand = `${prettyEnv ? `${prettyEnv} ` : ""}${[cmd, ...args]
    .map(shellEscape)
    .join(" ")}`;

  if (description) {
    info(description);
  }

  if (dryRun) {
    console.log(`[dry-run] ${prettyCommand}`);
    return { status: 0, stdout: "", stderr: "" };
  }

  return sh(cmd, args, { capture: false, extraEnv });
}

function shellEscape(value) {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getCurrentBranch() {
  return sh("git", ["branch", "--show-current"]).stdout;
}

function getShortHead() {
  return sh("git", ["rev-parse", "--short", "HEAD"]).stdout;
}

function getStatusShort() {
  return sh("git", ["status", "--short"]).stdout;
}

function ensureGitRepo() {
  const inside = sh("git", ["rev-parse", "--is-inside-work-tree"]).stdout;
  if (inside !== "true") {
    fail("Current directory is not a git repository.");
  }
}

function ensureWorkingTreeClean(allowDirty) {
  const status = getStatusShort();
  if (!status) {
    success("Working tree is clean.");
    return;
  }

  if (allowDirty) {
    warn("Working tree is dirty, but proceeding because --allow-dirty was used.");
    console.log(status);
    return;
  }

  fail(
    `Working tree is not clean.\n\nCurrent changes:\n${status}\n\nCommit, stash, or use --allow-dirty if you really intend to continue.`,
  );
}

function ensureBranchMatchesExpected(expectedBranch) {
  const currentBranch = getCurrentBranch();
  if (!currentBranch) {
    warn("Could not determine current branch.");
    return;
  }

  if (currentBranch !== expectedBranch) {
    warn(
      `Current branch is "${currentBranch}", not "${expectedBranch}". Continuing, but confirm this is intentional.`,
    );
    return;
  }

  success(`Current branch is ${expectedBranch}.`);
}

function ensureTagDoesNotExist(tag) {
  const result = sh("git", ["tag", "--list", tag]);
  if (result.stdout === tag) {
    fail(`Git tag ${tag} already exists locally.`);
  }

  const remote = sh(
    "git",
    ["ls-remote", "--tags", "origin", `refs/tags/${tag}`],
    { allowFailure: true },
  );
  if (remote.stdout.includes(`refs/tags/${tag}`)) {
    fail(`Git tag ${tag} already exists on origin.`);
  }
}

function checkGitHubCliAvailability() {
  const result = sh("gh", ["--version"], { allowFailure: true });
  if (result.status !== 0) {
    warn(
      "GitHub CLI does not appear to be available. Release monitoring hints will still be printed, but live checks may not work.",
    );
    return false;
  }
  return true;
}

function validateDesktopVersionFiles(expectedVersion, tag, options = {}) {
  const { enforceExpectedVersion = true, checkTagAlignment = true } = options;

  info("Validating desktop version consistency.");

  runOrPrint("node", ["./scripts/release/check-desktop-version.mjs"], {
    dryRun: false,
    description: "Run desktop version consistency check.",
  });

  if (checkTagAlignment) {
    runOrPrint(
      "node",
      ["./scripts/release/check-desktop-version.mjs", "--release-tag", tag],
      {
        dryRun: false,
        description: "Run desktop version and release-tag consistency check.",
      },
    );
  }

  const paths = [
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/tauri.conf.json",
    "apps/desktop/package.json",
  ];

  for (const relativePath of paths) {
    const fullPath = resolve(repoRoot, relativePath);
    const text = readFileSync(fullPath, "utf8");

    if (relativePath.endsWith(".toml")) {
      const match = text.match(/^\s*version\s*=\s*"([^"]+)"\s*$/m);
      if (!match) {
        fail(
          `Expected ${relativePath} to contain version "${expectedVersion}", but found "unknown".`,
        );
      }

      if (enforceExpectedVersion && match[1] !== expectedVersion) {
        fail(
          `Expected ${relativePath} to contain version "${expectedVersion}", but found "${match[1]}".`,
        );
      }
    } else {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        fail(`Failed to parse ${relativePath}: ${error.message}`);
      }

      if (enforceExpectedVersion && parsed.version !== expectedVersion) {
        fail(
          `Expected ${relativePath} to contain version "${expectedVersion}", but found "${parsed.version}".`,
        );
      }
    }
  }

  if (enforceExpectedVersion) {
    success(`Desktop version files match ${expectedVersion}.`);
  } else {
    success("Desktop version files are internally consistent.");
  }
}

function ensureReleaseNotesFile(version, dryRun) {
  const notesPath = buildReleaseNotesPath(version);

  if (dryRun) {
    info(`Dry run expects release notes at ${notesPath}.`);
    return notesPath;
  }

  runOrPrint(
    "node",
    ["./scripts/release/desktop-release-notes.mjs", "--version", version, "--verify"],
    {
      dryRun: false,
      description: "Verify release notes file exists for this desktop version.",
    },
  );

  success(`Release notes file resolved: ${notesPath}`);
  return notesPath;
}

function maybeCommitVersionBump(version, dryRun) {
  const versionFiles = [
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/tauri.conf.json",
    "apps/desktop/package.json",
  ];
  const releaseNotesPath = buildReleaseNotesPath(version);
  const trackedFiles = [...versionFiles, releaseNotesPath];

  const diff = sh("git", ["diff", "--name-only", "--", ...trackedFiles]);
  const staged = sh("git", ["diff", "--cached", "--name-only", "--", ...trackedFiles]);
  const untracked = sh("git", ["ls-files", "--others", "--exclude-standard", "--", ...trackedFiles]);

  const changed = new Set(
    [...diff.stdout.split("\n"), ...staged.stdout.split("\n"), ...untracked.stdout.split("\n")]
      .map((item) => item.trim())
      .filter(Boolean),
  );

  if (changed.size === 0) {
    info("No unstaged or staged version-file changes detected. Skipping commit step.");
    return;
  }

  runOrPrint("git", ["add", ...trackedFiles], {
    dryRun,
    description: "Stage desktop version files and release notes.",
  });

  const message = `chore(desktop): release ${version}`;
  runOrPrint("git", ["commit", "-m", message], {
    dryRun,
    description: `Create release-prep commit (${message}).`,
  });
}

function printMonitorGuidance(tag) {
  const version = tag.replace(/^desktop-v/, "");

  console.log("");
  console.log("Next checks:");
  console.log(`- GitHub Release: gh release view ${tag}`);
  console.log("- Recent workflow runs: gh run list --limit 10");
  console.log("- Open latest run in browser: gh run view --web");
  console.log("");
  console.log("Expected follow-up workflows:");
  console.log("- .github/workflows/release-desktop.yml");
  console.log("- .github/workflows/sync-homebrew-tap.yml");
  console.log("");
  console.log("Expected macOS artifacts:");
  console.log(`- Atmos_${version}_aarch64.dmg`);
  console.log(`- Atmos_${version}_x64.dmg`);
  console.log("");
  console.log("Recommended Homebrew verification after tap sync:");
  console.log("- brew install --cask AruNi-01/tap/atmos");
  console.log("- brew upgrade --cask atmos");
  console.log("");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = ensureValidVersion(args.version);
  const tag = buildDesktopTag(version);

  ensureGitRepo();

  const ghAvailable = checkGitHubCliAvailability();
  const currentBranch = getCurrentBranch();
  const shortHead = getShortHead();

  console.log("Atmos desktop release plan");
  console.log("--------------------------");
  console.log(`Version:       ${version}`);
  console.log(`Tag:           ${tag}`);
  console.log(`Prerelease:    ${args.prerelease ? "true" : "false"}`);
  console.log(`Dry run:       ${args.dryRun ? "true" : "false"}`);
  console.log(`Branch:        ${currentBranch || "(unknown)"}`);
  console.log(`HEAD:          ${shortHead || "(unknown)"}`);
  console.log("");

  ensureWorkingTreeClean(args.allowDirty);
  ensureBranchMatchesExpected(args.branch);

  if (args.createTag) {
    ensureTagDoesNotExist(tag);
  }

  if (args.dryRun) {
    runOrPrint(
      "node",
      ["./scripts/release/bump-desktop-version.mjs", version, "--dry-run"],
      {
        dryRun: true,
        description: "Preview desktop version bump.",
      },
    );

    validateDesktopVersionFiles(version, tag, {
      enforceExpectedVersion: false,
      checkTagAlignment: false,
    });

    info(
      `Dry run skips validating current files against ${tag} because the version bump has not been applied yet.`,
    );
    info(`Planned post-bump validation target: ${tag}`);
    ensureReleaseNotesFile(version, true);
  } else {
    runOrPrint("node", ["./scripts/release/bump-desktop-version.mjs", version], {
      dryRun: false,
      description: "Apply desktop version bump.",
    });

    validateDesktopVersionFiles(version, tag);
    ensureReleaseNotesFile(version, false);
  }

  runOrPrint(
    "git",
    [
      "--no-pager",
      "diff",
      "--",
      "apps/desktop/src-tauri/Cargo.toml",
      "apps/desktop/src-tauri/tauri.conf.json",
      "apps/desktop/package.json",
      buildReleaseNotesPath(version),
    ],
    {
      dryRun: false,
      description: "Review desktop version and release notes diff.",
    },
  );

  if (args.commit) {
    maybeCommitVersionBump(version, args.dryRun);
  } else {
    info("Skipping commit step because --no-commit was provided.");
  }

  if (args.pushCommit) {
    runOrPrint("git", ["push", "origin", args.branch], {
      dryRun: args.dryRun,
      description: `Push release-prep commit to origin/${args.branch}.`,
    });
  } else {
    info("Skipping push-commit step because --no-push-commit was provided.");
  }

  if (args.createTag) {
    runOrPrint("git", ["tag", tag], {
      dryRun: args.dryRun,
      description: `Create desktop release tag ${tag}.`,
    });
  } else {
    info("Skipping tag creation because --no-tag was provided.");
  }

  if (args.pushTag) {
    if (!args.createTag) {
      warn(
        "You requested --no-tag and did not disable --no-push-tag. Push-tag step requires the tag to exist already.",
      );
    }
    runOrPrint("git", ["push", "origin", tag], {
      dryRun: args.dryRun,
      description: `Push desktop release tag ${tag} to origin.`,
    });
  } else {
    info("Skipping push-tag step because --no-push-tag was provided.");
  }

  console.log("");
  success(`Atmos desktop release prep completed for ${tag}.`);

  if (args.dryRun) {
    console.log("");
    console.log("Dry run summary:");
    console.log(`- Would bump desktop version to ${version}`);
    console.log(`- Would validate version files against ${tag}`);
    if (args.commit) console.log("- Would commit release-prep changes");
    if (args.pushCommit) console.log(`- Would push commit to origin/${args.branch}`);
    if (args.createTag) console.log(`- Would create tag ${tag}`);
    if (args.pushTag) console.log(`- Would push tag ${tag}`);
    printMonitorGuidance(tag);
    return;
  }

  if (ghAvailable || args.monitor) {
    printMonitorGuidance(tag);
  }
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
