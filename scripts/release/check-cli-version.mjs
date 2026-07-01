import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ensureCalendarVersion } from "./lib/calendar-version.mjs";

const rootDir = resolve(import.meta.dirname, "../..");
const cliCargoToml = resolve(rootDir, "apps/cli/Cargo.toml");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readCliVersion() {
  const content = readFileSync(cliCargoToml, "utf8");
  const packageSectionMatch = content.match(/\[package\]([\s\S]*?)(?:\n\[|$)/);
  if (!packageSectionMatch) {
    fail(`Unable to resolve [package] section from ${cliCargoToml}`);
  }

  const versionMatch = packageSectionMatch[1].match(/^\s*version\s*=\s*"([^"]+)"\s*$/m);
  if (!versionMatch) {
    fail(`Unable to resolve version from ${cliCargoToml}`);
  }

  return versionMatch[1];
}

function getReleaseTagFromArgs(argv) {
  const fromEnv = process.env.RELEASE_TAG;
  if (fromEnv) return fromEnv;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--release-tag") {
      const next = argv[index + 1];
      if (!next) fail("Missing value for --release-tag");
      return next;
    }
    if (arg.startsWith("--release-tag=")) {
      return arg.slice("--release-tag=".length);
    }
  }

  return "";
}

const cliVersion = ensureCalendarVersion(readCliVersion(), "CLI version");
const releaseTag = getReleaseTagFromArgs(process.argv.slice(2));

console.log(`apps/cli/Cargo.toml: ${cliVersion}`);

if (releaseTag) {
  const expectedTag = `cli-${cliVersion}`;
  console.log(`release tag: ${releaseTag}`);
  if (releaseTag !== expectedTag) {
    fail(`Release tag mismatch: expected ${expectedTag}, got ${releaseTag}`);
  }
}

console.log("CLI release version is valid.");
