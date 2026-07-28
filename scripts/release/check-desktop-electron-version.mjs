#!/usr/bin/env node
/**
 * Validate apps/desktop-electron/package.json version.
 * Optional: RELEASE_TAG=desktop-electron-<version> must match package version.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ensureCalendarVersion,
  extractCalendarVersionFromTag,
} from "./lib/calendar-version.mjs";

const TAG_PREFIX = "desktop-electron-";
const repoRoot = resolve(import.meta.dirname, "../..");
const packageJsonPath = resolve(
  repoRoot,
  "apps/desktop-electron/package.json",
);

function main() {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = ensureCalendarVersion(
    pkg.version,
    "apps/desktop-electron/package.json version",
  );

  if (pkg.productName !== "Atmos") {
    throw new Error(
      `apps/desktop-electron/package.json productName must be "Atmos" (got ${JSON.stringify(pkg.productName)})`,
    );
  }

  const releaseTag = (process.env.RELEASE_TAG || "").trim();
  if (releaseTag) {
    const tagVersion = extractCalendarVersionFromTag(releaseTag, TAG_PREFIX);
    if (tagVersion !== version) {
      throw new Error(
        `Release tag ${releaseTag} version ${tagVersion} does not match package.json ${version}`,
      );
    }
  }

  console.log(
    `✅ desktop-electron version ${version}` +
      (releaseTag ? ` matches ${releaseTag}` : ""),
  );
}

main();
