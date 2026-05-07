#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeMsiWixVersion } from "./lib/msi-version.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");

const files = {
  cargo: resolve(repoRoot, "apps/desktop/src-tauri/Cargo.toml"),
  tauri: resolve(repoRoot, "apps/desktop/src-tauri/tauri.conf.json"),
  packageJson: resolve(repoRoot, "apps/desktop/package.json"),
};

function readText(path) {
  return readFileSync(path, "utf8");
}

function extractCargoVersion(content) {
  const packageSectionMatch = content.match(/\[package\]([\s\S]*?)(?:\n\[|$)/);
  if (!packageSectionMatch) {
    throw new Error("Could not find [package] section in Cargo.toml");
  }

  const versionMatch = packageSectionMatch[1].match(/^\s*version\s*=\s*"([^"]+)"\s*$/m);
  if (!versionMatch) {
    throw new Error('Could not find package version in Cargo.toml');
  }

  return versionMatch[1];
}

function extractJsonVersion(content, label) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${label} as JSON: ${error.message}`);
  }

  if (!parsed.version || typeof parsed.version !== "string") {
    throw new Error(`Missing string "version" field in ${label}`);
  }

  return parsed.version;
}

/**
 * Ensure `bundle.windows.wix.version` stays in sync with the top-level
 * Tauri `version`. The rule set lives in `./lib/msi-version.mjs` and is
 * shared with `bump-desktop-version.mjs` so the two cannot drift.
 */
function verifyWindowsWixVersion(content, label, tauriVersion) {
  const parsed = JSON.parse(content);
  const wixVersion = parsed?.bundle?.windows?.wix?.version ?? null;

  const expected = computeMsiWixVersion(tauriVersion, label);

  if (expected === null) {
    if (wixVersion !== null && wixVersion !== undefined) {
      throw new Error(
        `${label}: bundle.windows.wix.version is set to "${wixVersion}", but the top-level ` +
          `version "${tauriVersion}" is a stable release and must not carry a MSI override. ` +
          `Remove bundle.windows.wix.version or run scripts/release/bump-desktop-version.mjs.`,
      );
    }
    return { wixVersion: null, expected: null };
  }

  if (wixVersion !== expected) {
    throw new Error(
      `${label}: bundle.windows.wix.version is "${wixVersion ?? "<unset>"}" but must be ` +
        `"${expected}" for top-level version "${tauriVersion}". ` +
        `Run scripts/release/bump-desktop-version.mjs to resync.`,
    );
  }

  return { wixVersion, expected };
}

function extractReleaseVersionFromTag(tag) {
  const match = String(tag).trim().match(/^desktop-v(.+)$/);
  if (!match) {
    throw new Error(
      `Invalid release tag "${tag}". Expected format: desktop-v<version>`,
    );
  }

  return match[1];
}

function getReleaseTagFromArgs(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--release-tag") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --release-tag");
      }
      return value;
    }

    if (arg.startsWith("--release-tag=")) {
      return arg.slice("--release-tag=".length);
    }
  }

  return process.env.RELEASE_TAG || "";
}

function printResult(label, version) {
  console.log(`${label.padEnd(20)} ${version}`);
}

function main() {
  const cargoVersion = extractCargoVersion(readText(files.cargo));
  const tauriText = readText(files.tauri);
  const tauriVersion = extractJsonVersion(tauriText, "tauri.conf.json");
  const packageVersion = extractJsonVersion(readText(files.packageJson), "apps/desktop/package.json");
  const releaseTag = getReleaseTagFromArgs(process.argv.slice(2));

  console.log("Desktop version check");
  console.log("---------------------");
  printResult("Cargo.toml", cargoVersion);
  printResult("tauri.conf.json", tauriVersion);
  printResult("package.json", packageVersion);

  const { wixVersion, expected: expectedWix } = verifyWindowsWixVersion(
    tauriText,
    "tauri.conf.json",
    tauriVersion,
  );

  if (expectedWix !== null) {
    printResult("wix.version", `${wixVersion} (expected ${expectedWix})`);
  } else if (wixVersion) {
    // Should have been caught in verifyWindowsWixVersion; defensive no-op.
    printResult("wix.version", wixVersion);
  }

  const versions = [
    ["Cargo.toml", cargoVersion],
    ["tauri.conf.json", tauriVersion],
    ["package.json", packageVersion],
  ];

  if (releaseTag) {
    const releaseVersion = extractReleaseVersionFromTag(releaseTag);
    versions.push(["release tag", releaseVersion]);
    printResult("release tag", `${releaseTag} -> ${releaseVersion}`);
  }

  console.log("");

  const uniqueVersions = new Set(versions.map(([, version]) => version));

  if (uniqueVersions.size !== 1) {
    console.error("Desktop version mismatch detected.");
    for (const [label, version] of versions) {
      console.error(`- ${label}: ${version}`);
    }
    process.exit(1);
  }

  console.log(`All desktop versions are in sync: ${cargoVersion}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
