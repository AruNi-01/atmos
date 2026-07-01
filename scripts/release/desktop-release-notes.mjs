#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { ensureCalendarVersion, extractCalendarVersionFromTag } from "./lib/calendar-version.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");
const DESKTOP_TAG_PREFIX = "desktop-";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function buildReleaseTitle(version) {
  return `Atmos Desktop ${version}`;
}

function buildNotesRelativePath(version) {
  return `releasenotes/${buildReleaseTitle(version)}.md`;
}

function buildNotesAbsolutePath(version) {
  return resolve(repoRoot, buildNotesRelativePath(version));
}

function extractVersionFromTag(tag) {
  return extractCalendarVersionFromTag(tag, DESKTOP_TAG_PREFIX);
}

function parseArgs(argv) {
  const args = {
    version: "",
    releaseTag: process.env.RELEASE_TAG || "",
    print: "path",
    verify: false,
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

    if (arg === "--release-tag") {
      if (!next) fail("Missing value for --release-tag");
      args.releaseTag = next;
      i += 1;
      continue;
    }

    if (arg === "--print") {
      if (!next) fail("Missing value for --print");
      args.print = next;
      i += 1;
      continue;
    }

    if (arg === "--verify") {
      args.verify = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`Resolve Atmos desktop release-notes file

Usage:
  node ./scripts/release/desktop-release-notes.mjs --version 2026.7.2
  node ./scripts/release/desktop-release-notes.mjs --release-tag desktop-2026.7.2 --verify

Options:
  --version <version>       Desktop version
  --release-tag <tag>       Desktop tag, defaults to RELEASE_TAG
  --print <field>           One of: path, abs-path, title
  --verify                  Fail if the resolved markdown file does not exist
`);
      process.exit(0);
    }

    fail(`Unknown argument: ${arg}`);
  }

  if (!args.version) {
    if (!args.releaseTag) {
      fail("Pass --version or --release-tag.");
    }
    args.version = extractVersionFromTag(args.releaseTag);
  }

  args.version = ensureCalendarVersion(args.version, "desktop version");

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const title = buildReleaseTitle(args.version);
  const relativePath = buildNotesRelativePath(args.version);
  const absolutePath = buildNotesAbsolutePath(args.version);

  if (args.verify && !existsSync(absolutePath)) {
    fail(`Missing release notes file: ${relativePath}`);
  }

  if (args.print === "title") {
    console.log(title);
    return;
  }

  if (args.print === "abs-path") {
    console.log(absolutePath);
    return;
  }

  if (args.print === "path") {
    console.log(relativePath);
    return;
  }

  fail(`Unsupported --print value "${args.print}". Use path, abs-path, or title.`);
}

main();
