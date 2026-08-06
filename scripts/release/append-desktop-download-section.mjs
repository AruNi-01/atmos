#!/usr/bin/env node
/**
 * Finalize a desktop GitHub Release body:
 * 1. Optional Contributors thank-you with @mentions (powers GitHub's native
 *    Contributors avatar strip above Assets — not a separate API flag)
 * 2. Collapsed Download section with versioned installer links
 *
 * Usage:
 *   node scripts/release/append-desktop-download-section.mjs \
 *     --version 2026.8.2-beta.1 \
 *     --notes "releasenotes/Atmos Desktop 2026.8.2-beta.1.md" \
 *     --out /tmp/final-notes.md \
 *     --auto-contributors
 *
 *   cat body.md | node scripts/release/append-desktop-download-section.mjs \
 *     --version 2026.8.2 --print --contributors alice,bob
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ensureDesktopReleaseNotesExtras,
  rankContributorLogins,
} from "./electron-release-notes.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sh(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
  if (result.error) {
    fail(`Failed to run ${command}: ${result.error.message}`);
  }
  if ((result.status ?? 0) !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    if (options.allowFail) return "";
    fail(`${command} ${args.join(" ")} failed: ${detail || `exit ${result.status}`}`);
  }
  return (result.stdout || "").trim();
}

function parseArgs(argv) {
  const args = {
    version: "",
    tag: "",
    repo: "",
    notes: "",
    out: "",
    print: false,
    previousTag: "",
    contributors: "",
    autoContributors: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--version") {
      if (!next) fail("Missing value for --version");
      args.version = next;
      i += 1;
      continue;
    }
    if (arg === "--tag") {
      if (!next) fail("Missing value for --tag");
      args.tag = next;
      i += 1;
      continue;
    }
    if (arg === "--repo") {
      if (!next) fail("Missing value for --repo");
      args.repo = next;
      i += 1;
      continue;
    }
    if (arg === "--notes") {
      if (!next) fail("Missing value for --notes");
      args.notes = next;
      i += 1;
      continue;
    }
    if (arg === "--out") {
      if (!next) fail("Missing value for --out");
      args.out = next;
      i += 1;
      continue;
    }
    if (arg === "--previous-tag") {
      if (!next) fail("Missing value for --previous-tag");
      args.previousTag = next;
      i += 1;
      continue;
    }
    if (arg === "--contributors") {
      if (!next) fail("Missing value for --contributors");
      args.contributors = next;
      i += 1;
      continue;
    }
    if (arg === "--auto-contributors") {
      args.autoContributors = true;
      continue;
    }
    if (arg === "--print") {
      args.print = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`Finalize Desktop release notes (Contributors + Download)

Usage:
  node scripts/release/append-desktop-download-section.mjs --version <ver> --notes <path> --out <path> [--auto-contributors]
  node scripts/release/append-desktop-download-section.mjs --version <ver> --print < body.md

Options:
  --version <version>        Desktop calendar version (required)
  --tag <tag>                Full release tag (default: desktop-electron-<version>)
  --repo <owner/repo>        GitHub repo for asset URLs / compare (default: AruNi-01/atmos or GITHUB_REPOSITORY)
  --notes <path>             Input markdown path (omit to read stdin)
  --out <path>               Output path (required unless --print)
  --print                    Write result to stdout
  --contributors a,b,c       Explicit GitHub logins to @mention
  --auto-contributors        Collect commit authors via GitHub compare API
  --previous-tag <tag>       Base tag for --auto-contributors (default: previous desktop-electron-*)
`);
      process.exit(0);
    }
    fail(`Unknown argument: ${arg}`);
  }

  if (!args.version) fail("Pass --version <version>.");
  if (!args.print && !args.out) fail("Pass --out <path> or --print.");
  return args;
}

function resolveRepo(explicit) {
  if (explicit) return explicit;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const remote = sh("git", ["remote", "get-url", "origin"], { allowFail: true });
  const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  return match ? `${match[1]}/${match[2]}` : "AruNi-01/atmos";
}

function resolvePreviousElectronTag(currentTag, explicit) {
  if (explicit) return explicit;
  const tags = sh("git", [
    "for-each-ref",
    "--sort=-creatordate",
    "--format=%(refname:strip=2)",
    "refs/tags/desktop-electron-*",
  ], { allowFail: true })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return tags.find((tag) => tag !== currentTag) || "";
}

/**
 * Collect GitHub logins from commits between previousTag...currentTag.
 * Uses the compare API (author.login is linked GitHub accounts only).
 * Returns unique logins ranked by commit count (desc).
 * @param {{ repo: string, previousTag: string, currentTag: string }} opts
 * @returns {string[]}
 */
export function collectReleaseContributorLogins({ repo, previousTag, currentTag }) {
  if (!previousTag || !currentTag) return [];

  // One login per commit (duplicates preserved for ranking by contribution volume).
  // Prefer gh (auth via GITHUB_TOKEN / gh auth). Fall back to empty on failure.
  let raw = sh(
    "gh",
    [
      "api",
      "--paginate",
      `repos/${repo}/compare/${previousTag}...${currentTag}`,
      "--jq",
      "[.commits[]?.author?.login // empty] | .[]",
    ],
    { allowFail: true },
  );

  if (!raw) {
    // Non-paginated single compare (paginate on compare can be awkward); try once.
    raw = sh(
      "gh",
      [
        "api",
        `repos/${repo}/compare/${previousTag}...${currentTag}`,
        "--jq",
        "[.commits[]?.author?.login // empty] | .[]",
      ],
      { allowFail: true },
    );
  }

  return rankContributorLogins(raw.split("\n"));
}

function parseExplicitContributors(value) {
  if (!value) return [];
  // Explicit list has no volume signal — rank as one each (alpha after equal counts).
  return rankContributorLogins(
    value.split(/[,\s]+/).map((part) => part.trim()),
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const body = args.notes
    ? readFileSync(resolve(args.notes), "utf8")
    : readFileSync(0, "utf8");

  const tag = args.tag || `desktop-electron-${args.version}`;
  const repo = resolveRepo(args.repo);

  let contributors = parseExplicitContributors(args.contributors);
  if (args.autoContributors) {
    const previousTag = resolvePreviousElectronTag(tag, args.previousTag);
    if (!previousTag) {
      console.error(
        `⚠️ --auto-contributors: no previous desktop-electron-* tag found; skipping contributors`,
      );
    } else {
      const auto = collectReleaseContributorLogins({
        repo,
        previousTag,
        currentTag: tag,
      });
      console.error(
        `Contributors ${previousTag}...${tag} (by commit volume): ${
          auto.length ? auto.map((l) => `@${l}`).join(", ") : "(none)"
        }`,
      );
      // Re-rank: auto list is already volume-sorted unique; expand so explicit
      // users not in the range still appear (count 1) without flattening auto ranks.
      // Prefer auto order (volume); append missing explicit at the end alpha-ranked.
      if (contributors.length === 0) {
        contributors = auto;
      } else {
        const autoSet = new Set(auto.map((l) => l.toLowerCase()));
        const extras = contributors.filter(
          (l) => !autoSet.has(l.toLowerCase()),
        );
        contributors = [...auto, ...extras];
      }
    }
  }

  const result = ensureDesktopReleaseNotesExtras(body, args.version, {
    tag,
    repo,
    contributors,
  });

  if (args.print) {
    process.stdout.write(result);
    return;
  }

  writeFileSync(resolve(args.out), result, "utf8");
}

main();
