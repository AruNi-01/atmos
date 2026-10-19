// Cold-launch and prebuilt-artifact decisions for verify-ios-scene-lifecycle.sh.
// A dyld death can leave simctl launch at exit 0. PASS also requires the
// pid to still be alive and no new Atmos .ips. A source-build pod install
// is NOT RUN (exit 2), not a pass and not a product failure.

import fs from "node:fs";
import path from "node:path";

export const MIN_COLD_LAUNCH_SECONDS = 3;
const RUNTIME_ISSUE = "UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption";
const SOURCE_BUILD_LINE = "Building from source: true";
const NO_PREBUILT_LINE = "No prebuilt artifacts found";
const RELEASE_TARBALL = /^reactnative-dependencies-.*-release\.tar\.gz$/;
const ATMOS_IPS = /(^|[^A-Za-z0-9])Atmos([^A-Za-z0-9]|$)/;

export function isAtmosIpsName(name) {
  return name.endsWith(".ips") && ATMOS_IPS.test(name);
}

export function isReleaseDepsTarball(name) {
  return RELEASE_TARBALL.test(name);
}

function listReleaseDepsTarballs(dir) {
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`artifacts path is not a directory: ${dir}`);
  }
  return fs
    .readdirSync(dir)
    .filter((name) => {
      const full = path.join(dir, name);
      return fs.statSync(full).isFile() && isReleaseDepsTarball(name);
    })
    .sort();
}

export function judgePrebuilt(podLog, tarballNames) {
  const log = String(podLog);
  const names = tarballNames.filter((name) => isReleaseDepsTarball(path.basename(name)));
  const reasons = [];
  if (log.includes(SOURCE_BUILD_LINE)) {
    reasons.push(
      'network: pod install log contains "Building from source: true" (download fell back to a source build)',
    );
  }
  if (log.includes(NO_PREBUILT_LINE)) {
    reasons.push('missing prebuilt: pod install log contains "No prebuilt artifacts found"');
  }
  if (names.length === 0) {
    reasons.push("missing prebuilt: reactnative-dependencies-*-release.tar.gz was not downloaded");
  }
  return { ok: reasons.length === 0, reasons, tarballs: names };
}

export function prebuiltSummary(reasons) {
  const network = reasons.some((reason) => reason.startsWith("network:"));
  const missing = reasons.some((reason) => reason.startsWith("missing prebuilt:"));
  let why = "network or missing prebuilt";
  if (network && !missing) why = "network";
  if (missing && !network) why = "missing prebuilt";
  return `NOT RUN: simulator. React Native prebuilt artifacts are missing after pod install (${why}).`;
}

function walkAtmosIps(root, found) {
  if (!fs.existsSync(root)) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkAtmosIps(full, found);
    } else if (entry.isFile() && isAtmosIpsName(entry.name)) {
      found.push(full);
    }
  }
}

export function listAtmosIps(roots) {
  const found = [];
  for (const root of roots) {
    if (root) walkAtmosIps(root, found);
  }
  return found.sort();
}

export function newAtmosIps(beforePaths, afterPaths) {
  const seen = new Set();
  for (const raw of beforePaths) {
    const base = path.basename(String(raw).trim());
    if (isAtmosIpsName(base)) seen.add(base);
  }
  const added = [];
  const addedSet = new Set();
  for (const raw of afterPaths) {
    const base = path.basename(String(raw).trim());
    if (!isAtmosIpsName(base) || seen.has(base) || addedSet.has(base)) continue;
    addedSet.add(base);
    added.push(base);
  }
  return added;
}

function readList(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function judgeColdLaunch(input) {
  const label = input.label || "cold";
  const launchStatus = Number(input.launchStatus);
  const launchOutput = String(input.launchOutput ?? "");
  const alive = input.alive === true || input.alive === 1 || input.alive === "1";
  const waitedSeconds = Number(input.waitedSeconds);
  const runtimeLog = String(input.runtimeLog ?? "");
  const added = newAtmosIps(input.beforeIps ?? [], input.afterIps ?? []);
  const errors = [];
  if (
    !Number.isInteger(launchStatus) ||
    launchStatus !== 0 ||
    /EXC_BREAKPOINT|Terminated/.test(launchOutput)
  ) {
    errors.push("cold launch did not stay up");
  }
  if (!alive || !Number.isFinite(waitedSeconds) || waitedSeconds < MIN_COLD_LAUNCH_SECONDS) {
    // The shell passes COLD_LAUNCH_WAIT_SECONDS. Print that value.
    const reportedSeconds = Number.isFinite(waitedSeconds)
      ? waitedSeconds
      : MIN_COLD_LAUNCH_SECONDS;
    errors.push(`process was not alive ${reportedSeconds}s after launch`);
  }
  if (added.length > 0) {
    errors.push(`new Atmos crash report: ${added.join(", ")}`);
  }
  if (runtimeLog.includes(RUNTIME_ISSUE)) {
    errors.push("UIKit reported no scene lifecycle");
  }
  if (runtimeLog.includes("EXC_BREAKPOINT")) {
    errors.push("EXC_BREAKPOINT in Atmos logs");
  }
  if (
    runtimeLog.includes("OS_REASON_DYLD") ||
    runtimeLog.includes("Library not loaded: @rpath/React.framework/React")
  ) {
    errors.push("dyld did not load React.framework");
  }
  return { ok: errors.length === 0, errors, added, label };
}

function printColdResult(result) {
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`FAIL ${result.label}: ${error}`);
    }
    return 1;
  }
  console.log(`PASS ${result.label}: cold launch`);
  return 0;
}

function judgePrebuiltMain(logPath, artifactsDir) {
  const result = judgePrebuilt(
    fs.readFileSync(logPath, "utf8"),
    listReleaseDepsTarballs(artifactsDir),
  );
  if (!result.ok) {
    console.error(prebuiltSummary(result.reasons));
    for (const reason of result.reasons) {
      console.error(`- ${reason}`);
    }
    return 2;
  }
  console.log(`prebuilt ok: ${result.tarballs.join(", ")}`);
  return 0;
}

function judgeColdMain(argv) {
  const [
    label,
    launchStatus,
    launchOutputFile,
    alive,
    waitedSeconds,
    runtimeLogFile,
    beforeFile,
    afterFile,
  ] = argv;
  if (
    !label ||
    launchStatus == null ||
    !launchOutputFile ||
    alive == null ||
    waitedSeconds == null ||
    !runtimeLogFile ||
    !beforeFile ||
    !afterFile
  ) {
    console.error(
      "Usage: scene-launch-evidence.js judge-cold <label> <launch-status> <launch-output> <alive> <seconds> <runtime-log> <before-ips> <after-ips>",
    );
    return 1;
  }
  return printColdResult(
    judgeColdLaunch({
      label,
      launchStatus,
      launchOutput: fs.readFileSync(launchOutputFile, "utf8"),
      alive,
      waitedSeconds,
      runtimeLog: fs.readFileSync(runtimeLogFile, "utf8"),
      beforeIps: readList(beforeFile),
      afterIps: readList(afterFile),
    }),
  );
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === "judge-prebuilt") {
    const [logPath, artifactsDir] = rest;
    if (!logPath || !artifactsDir) {
      console.error("Usage: scene-launch-evidence.js judge-prebuilt <pod-log> <artifacts-dir>");
      return 1;
    }
    return judgePrebuiltMain(logPath, artifactsDir);
  }
  if (command === "judge-cold") {
    return judgeColdMain(rest);
  }
  if (command === "list-ips") {
    if (rest.length === 0) {
      console.error("Usage: scene-launch-evidence.js list-ips <dir> [dir...]");
      return 1;
    }
    for (const file of listAtmosIps(rest)) {
      console.log(file);
    }
    return 0;
  }
  console.error("Usage: scene-launch-evidence.js <judge-prebuilt|judge-cold|list-ips> ...");
  return 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
