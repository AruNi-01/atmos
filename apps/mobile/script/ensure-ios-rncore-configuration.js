#!/usr/bin/env node
"use strict";

/**
 * Keep Pods/React-Core-prebuilt aligned with the upcoming Xcode configuration.
 *
 * RN 0.85 ships Debug and Release prebuilt cores and swaps them in place via
 * scripts/replace-rncore-version.js. When
 * Pods/React-Core-prebuilt/.last_build_configuration is missing, that script
 * assumes the tree is already Debug and skips the swap. A Release core has no
 * RCTPackagerConnection, so a later Debug link (expo-dev-launcher) fails.
 *
 * This wrapper treats a missing marker as unknown, not Debug, and forces the
 * official replace script to run. justfile Release recipes restore Debug
 * afterwards so daily Debug builds keep a Debug resting tree.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const VALID_CONFIGURATIONS = new Set(["Debug", "Release"]);
const MARKER_REL = path.join("React-Core-prebuilt", ".last_build_configuration");
const PREBUILT_DIR = "React-Core-prebuilt";
const ARTIFACTS_DIR = "ReactNativeCore-artifacts";

function oppositeConfiguration(configuration) {
  return configuration === "Debug" ? "Release" : "Debug";
}

function normalizeConfiguration(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return VALID_CONFIGURATIONS.has(trimmed) ? trimmed : null;
}

function markerPath(podsRoot) {
  return path.join(podsRoot, MARKER_REL);
}

function readMarker(podsRoot) {
  const file = markerPath(podsRoot);
  if (!fs.existsSync(file)) {
    return null;
  }
  return normalizeConfiguration(fs.readFileSync(file, "utf8"));
}

function writeMarker(podsRoot, configuration) {
  const file = markerPath(podsRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, configuration);
}

function tarballName(version, configuration) {
  return `reactnative-core-${version.toLowerCase()}-${configuration.toLowerCase()}.tar.gz`;
}

function tarballPath(podsRoot, version, configuration) {
  return path.join(podsRoot, ARTIFACTS_DIR, tarballName(version, configuration));
}

function defaultResolveReactNative(mobileRoot) {
  const packageJson = require.resolve("react-native/package.json", { paths: [mobileRoot] });
  const version = require(packageJson).version;
  const scriptPath = path.join(path.dirname(packageJson), "scripts", "replace-rncore-version.js");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`React Native replace-rncore-version.js not found at ${scriptPath}`);
  }
  return { version, scriptPath };
}

function defaultRunReplace({ scriptPath, configuration, version, podsRoot }) {
  const result = spawnSync(
    process.execPath,
    [scriptPath, "-c", configuration, "-r", version, "-p", podsRoot],
    { cwd: podsRoot, stdio: "inherit" },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`replace-rncore-version.js exited ${result.status ?? "unknown"}`);
  }
}

function defaultRunPodInstall(iosDir) {
  const result = spawnSync("pod", ["install"], { cwd: iosDir, stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`pod install exited ${result.status ?? "unknown"}`);
  }
}

function log(message) {
  console.log(`[ios-rncore] ${message}`);
}

function ensureIosRncoreConfiguration(options) {
  const configuration = normalizeConfiguration(options.configuration);
  if (!configuration) {
    throw new Error('configuration must be "Debug" or "Release"');
  }

  const iosDir = path.resolve(options.iosDir);
  const podsRoot = path.join(iosDir, "Pods");
  const checkOnly = options.checkOnly === true;
  const resolveReactNative = options.resolveReactNative ?? defaultResolveReactNative;
  const runReplace = options.runReplace ?? defaultRunReplace;
  const runPodInstall = options.runPodInstall ?? defaultRunPodInstall;
  const mobileRoot = options.mobileRoot ?? path.resolve(iosDir, "..");

  if (!fs.existsSync(podsRoot)) {
    return { status: "skipped", reason: "pods-missing", configuration, iosDir };
  }

  const prebuiltDir = path.join(podsRoot, PREBUILT_DIR);
  if (!fs.existsSync(prebuiltDir)) {
    return { status: "skipped", reason: "prebuilt-missing", configuration, iosDir };
  }

  const current = readMarker(podsRoot);
  if (current === configuration) {
    return {
      status: "ok",
      reason: "already-matching",
      configuration,
      current,
      iosDir,
    };
  }

  if (checkOnly) {
    return {
      status: "mismatch",
      reason: current == null ? "marker-missing" : "marker-mismatch",
      configuration,
      current,
      iosDir,
    };
  }

  const reactNative = resolveReactNative(mobileRoot);
  const desiredTarball = tarballPath(podsRoot, reactNative.version, configuration);

  const seedOppositeIfMissing = () => {
    if (readMarker(podsRoot) != null) {
      return;
    }
    // RN treats a missing marker as Debug and skips. Seed the opposite so it
    // always extracts the requested tarball.
    writeMarker(podsRoot, oppositeConfiguration(configuration));
  };

  const replaceOnce = () => {
    seedOppositeIfMissing();
    runReplace({
      scriptPath: reactNative.scriptPath,
      configuration,
      version: reactNative.version,
      podsRoot,
    });
  };

  try {
    if (!fs.existsSync(desiredTarball)) {
      throw new Error(`missing ${path.basename(desiredTarball)}`);
    }
    replaceOnce();
  } catch (firstError) {
    log(
      `replace failed (${firstError instanceof Error ? firstError.message : firstError}); running pod install`,
    );
    runPodInstall(iosDir);
    if (!fs.existsSync(desiredTarball)) {
      throw new Error(
        `React Native ${configuration} prebuilt tarball still missing after pod install: ${desiredTarball}`,
      );
    }
    replaceOnce();
  }

  const after = readMarker(podsRoot);
  if (after !== configuration) {
    throw new Error(
      `React-Core-prebuilt marker is ${after ?? "missing"} after replace; expected ${configuration}`,
    );
  }

  return {
    status: "replaced",
    reason: current == null ? "marker-missing" : "marker-mismatch",
    configuration,
    current,
    iosDir,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let configuration = null;
  let iosDir = path.join(__dirname, "..", "ios");
  let checkOnly = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--check") {
      checkOnly = true;
      continue;
    }
    if (arg === "--ios-dir") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("--ios-dir requires a path");
      }
      iosDir = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (configuration) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    configuration = arg;
  }

  if (!configuration) {
    throw new Error(
      "Usage: ensure-ios-rncore-configuration.js <Debug|Release> [--ios-dir <path>] [--check]",
    );
  }

  return { configuration, iosDir, checkOnly };
}

function main(argv = process.argv) {
  const parsed = parseArgs(argv);
  const result = ensureIosRncoreConfiguration(parsed);

  if (result.status === "skipped") {
    log(`skip ${result.configuration}: ${result.reason}`);
    return result;
  }
  if (result.status === "ok") {
    log(`Pods React-Core-prebuilt is ${result.configuration} (matches)`);
    return result;
  }
  if (result.status === "mismatch") {
    log(`mismatch: want ${result.configuration}, marker is ${result.current ?? "missing"}`);
    process.exitCode = 1;
    return result;
  }

  log(`replaced ${result.current ?? "unknown"} → ${result.configuration} (${result.reason})`);
  return result;
}

module.exports = {
  ARTIFACTS_DIR,
  MARKER_REL,
  PREBUILT_DIR,
  ensureIosRncoreConfiguration,
  main,
  markerPath,
  normalizeConfiguration,
  oppositeConfiguration,
  parseArgs,
  readMarker,
  tarballName,
  writeMarker,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[ios-rncore] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
