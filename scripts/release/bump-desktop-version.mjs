#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DESKTOP_PACKAGE_JSON = "apps/desktop/package.json";
const DESKTOP_CARGO_TOML = "apps/desktop/src-tauri/Cargo.toml";
const DESKTOP_TAURI_CONF = "apps/desktop/src-tauri/tauri.conf.json";

function printUsage() {
  console.error(`Usage:
  node scripts/release/bump-desktop-version.mjs <version> [--dry-run]

Examples:
  node scripts/release/bump-desktop-version.mjs 0.2.1
  node scripts/release/bump-desktop-version.mjs 1.0.0-rc.1 --dry-run
`);
}

function parseArgs(argv) {
  const args = {
    version: "",
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (!args.version) {
      args.version = arg;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function ensureValidVersion(version) {
  const normalized = String(version || "").trim();

  if (!normalized) {
    throw new Error("Missing version. Example: 0.2.1");
  }

  // Semver-ish with optional prerelease/build metadata.
  const VERSION_RE =
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

  if (!VERSION_RE.test(normalized)) {
    throw new Error(
      `Invalid version "${normalized}". Expected something like 0.2.1 or 1.0.0-rc.1`,
    );
  }

  return normalized;
}

function updateJsonVersion(jsonText, fileLabel, nextVersion) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`${fileLabel} is not valid JSON: ${error.message}`);
  }

  if (typeof parsed.version !== "string") {
    throw new Error(`${fileLabel} does not contain a string "version" field`);
  }

  const previousVersion = parsed.version;
  parsed.version = nextVersion;

  const updatedText = `${JSON.stringify(parsed, null, 2)}\n`;

  return {
    previousVersion,
    updatedText,
  };
}

function updateCargoVersion(tomlText, fileLabel, nextVersion) {
  const packageSectionMatch = tomlText.match(
    /^\[package\][\s\S]*?(?=^\[|\Z)/m,
  );

  if (!packageSectionMatch) {
    throw new Error(`${fileLabel} does not contain a [package] section`);
  }

  const packageSection = packageSectionMatch[0];
  const versionMatch = packageSection.match(/^version\s*=\s*"([^"]+)"\s*$/m);

  if (!versionMatch) {
    throw new Error(
      `${fileLabel} does not contain version = "..." inside [package]`,
    );
  }

  const previousVersion = versionMatch[1];
  const updatedPackageSection = packageSection.replace(
    /^version\s*=\s*"([^"]+)"\s*$/m,
    `version = "${nextVersion}"`,
  );

  const updatedText = tomlText.replace(packageSection, updatedPackageSection);

  return {
    previousVersion,
    updatedText,
  };
}

function updateTauriConfigVersion(jsonText, fileLabel, nextVersion) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`${fileLabel} is not valid JSON: ${error.message}`);
  }

  if (typeof parsed.version !== "string") {
    throw new Error(`${fileLabel} does not contain a top-level string "version"`);
  }

  const previousVersion = parsed.version;
  parsed.version = nextVersion;

  const updatedText = `${JSON.stringify(parsed, null, 2)}\n`;

  return {
    previousVersion,
    updatedText,
  };
}

function readText(rootDir, relativePath) {
  const absolutePath = resolve(rootDir, relativePath);
  return {
    absolutePath,
    text: readFileSync(absolutePath, "utf8"),
  };
}

function writeText(absolutePath, text) {
  writeFileSync(absolutePath, text, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.version) {
    printUsage();
    process.exit(1);
  }

  const nextVersion = ensureValidVersion(args.version);
  const rootDir = resolve(import.meta.dirname, "../..");

  const packageJson = readText(rootDir, DESKTOP_PACKAGE_JSON);
  const cargoToml = readText(rootDir, DESKTOP_CARGO_TOML);
  const tauriConf = readText(rootDir, DESKTOP_TAURI_CONF);

  const packageResult = updateJsonVersion(
    packageJson.text,
    DESKTOP_PACKAGE_JSON,
    nextVersion,
  );
  const cargoResult = updateCargoVersion(
    cargoToml.text,
    DESKTOP_CARGO_TOML,
    nextVersion,
  );
  const tauriResult = updateTauriConfigVersion(
    tauriConf.text,
    DESKTOP_TAURI_CONF,
    nextVersion,
  );

  const previousVersions = new Set([
    packageResult.previousVersion,
    cargoResult.previousVersion,
    tauriResult.previousVersion,
  ]);

  if (previousVersions.size !== 1) {
    console.warn("Warning: desktop version sources were not aligned before bump.");
    console.warn(
      `- ${DESKTOP_PACKAGE_JSON}: ${packageResult.previousVersion}`,
    );
    console.warn(`- ${DESKTOP_CARGO_TOML}: ${cargoResult.previousVersion}`);
    console.warn(`- ${DESKTOP_TAURI_CONF}: ${tauriResult.previousVersion}`);
  }

  if (args.dryRun) {
    console.log(`[dry-run] Would update desktop version sources to ${nextVersion}`);
    console.log(`- ${DESKTOP_PACKAGE_JSON}`);
    console.log(`- ${DESKTOP_CARGO_TOML}`);
    console.log(`- ${DESKTOP_TAURI_CONF}`);
    return;
  }

  writeText(packageJson.absolutePath, packageResult.updatedText);
  writeText(cargoToml.absolutePath, cargoResult.updatedText);
  writeText(tauriConf.absolutePath, tauriResult.updatedText);

  console.log(`Updated desktop version to ${nextVersion}`);
  console.log(`- ${DESKTOP_PACKAGE_JSON}`);
  console.log(`- ${DESKTOP_CARGO_TOML}`);
  console.log(`- ${DESKTOP_TAURI_CONF}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}