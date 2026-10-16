const { describe, expect, test } = require("bun:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ARTIFACTS_DIR,
  PREBUILT_DIR,
  ensureIosRncoreConfiguration,
  normalizeConfiguration,
  oppositeConfiguration,
  parseArgs,
  tarballName,
  writeMarker,
} = require("./ensure-ios-rncore-configuration");

function makeIosTree({ marker, tarballs = ["Debug", "Release"] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atmos-rncore-"));
  const iosDir = path.join(root, "ios");
  const podsRoot = path.join(iosDir, "Pods");
  fs.mkdirSync(path.join(podsRoot, PREBUILT_DIR), { recursive: true });
  fs.mkdirSync(path.join(podsRoot, ARTIFACTS_DIR), { recursive: true });
  for (const configuration of tarballs) {
    fs.writeFileSync(tarballPath(podsRoot, configuration), "fake");
  }
  if (marker != null) {
    writeMarker(podsRoot, marker);
  }
  return { root, iosDir, podsRoot };
}

function tarballPath(podsRoot, configuration) {
  return path.join(podsRoot, ARTIFACTS_DIR, tarballName("0.85.3", configuration));
}

function markerContents(podsRoot) {
  const file = path.join(podsRoot, PREBUILT_DIR, ".last_build_configuration");
  if (!fs.existsSync(file)) {
    return null;
  }
  return fs.readFileSync(file, "utf8");
}

function fakeReactNative(podsRoot) {
  const calls = [];
  return {
    calls,
    resolveReactNative: () => ({
      version: "0.85.3",
      scriptPath: "/fake/replace-rncore-version.js",
    }),
    runReplace: (args) => {
      calls.push({ kind: "replace", ...args });
      writeMarker(podsRoot, args.configuration);
    },
    runPodInstall: (iosDir) => {
      calls.push({ kind: "pod-install", iosDir });
    },
  };
}

describe("normalizeConfiguration", () => {
  test("accepts Debug and Release after trimming", () => {
    expect(normalizeConfiguration("Debug")).toBe("Debug");
    expect(normalizeConfiguration("Release\n")).toBe("Release");
    expect(normalizeConfiguration(" debug ")).toBeNull();
    expect(normalizeConfiguration("")).toBeNull();
  });
});

describe("ensureIosRncoreConfiguration", () => {
  test("skips when Pods are missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atmos-rncore-empty-"));
    const iosDir = path.join(root, "ios");
    fs.mkdirSync(iosDir);
    const result = ensureIosRncoreConfiguration({ configuration: "Debug", iosDir });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("pods-missing");
  });

  test("skips when React-Core-prebuilt is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atmos-rncore-noprebuilt-"));
    const iosDir = path.join(root, "ios");
    fs.mkdirSync(path.join(iosDir, "Pods"), { recursive: true });
    const result = ensureIosRncoreConfiguration({ configuration: "Debug", iosDir });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("prebuilt-missing");
  });

  test("does not replace when the marker already matches", () => {
    const { iosDir, podsRoot } = makeIosTree({ marker: "Debug" });
    const fake = fakeReactNative(podsRoot);
    const result = ensureIosRncoreConfiguration({
      configuration: "Debug",
      iosDir,
      ...fake,
    });
    expect(result).toMatchObject({ status: "ok", reason: "already-matching", current: "Debug" });
    expect(fake.calls).toEqual([]);
  });

  test("treats a missing marker as unknown and forces a Debug replace", () => {
    const { iosDir, podsRoot } = makeIosTree();
    const fake = fakeReactNative(podsRoot);
    const result = ensureIosRncoreConfiguration({
      configuration: "Debug",
      iosDir,
      ...fake,
    });
    expect(result).toMatchObject({
      status: "replaced",
      reason: "marker-missing",
      current: null,
      configuration: "Debug",
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({
      kind: "replace",
      configuration: "Debug",
      version: "0.85.3",
      podsRoot,
    });
    expect(markerContents(podsRoot)).toBe("Debug");
  });

  test("seeds the opposite marker before replace so RN will not skip Debug", () => {
    const { iosDir, podsRoot } = makeIosTree();
    const seen = [];
    const result = ensureIosRncoreConfiguration({
      configuration: "Debug",
      iosDir,
      resolveReactNative: () => ({
        version: "0.85.3",
        scriptPath: "/fake/replace-rncore-version.js",
      }),
      runReplace: ({ configuration }) => {
        seen.push(markerContents(podsRoot));
        writeMarker(podsRoot, configuration);
      },
      runPodInstall: () => {
        throw new Error("pod install should not run");
      },
    });
    expect(result.status).toBe("replaced");
    expect(seen).toEqual(["Release"]);
    expect(oppositeConfiguration("Debug")).toBe("Release");
  });

  test("replaces Release with Debug when the marker mismatches", () => {
    const { iosDir, podsRoot } = makeIosTree({ marker: "Release" });
    const fake = fakeReactNative(podsRoot);
    const result = ensureIosRncoreConfiguration({
      configuration: "Debug",
      iosDir,
      ...fake,
    });
    expect(result).toMatchObject({
      status: "replaced",
      reason: "marker-mismatch",
      current: "Release",
    });
    expect(fake.calls).toHaveLength(1);
    expect(markerContents(podsRoot)).toBe("Debug");
  });

  test("replaces Debug with Release for a store build", () => {
    const { iosDir, podsRoot } = makeIosTree({ marker: "Debug" });
    const fake = fakeReactNative(podsRoot);
    const result = ensureIosRncoreConfiguration({
      configuration: "Release",
      iosDir,
      ...fake,
    });
    expect(result.status).toBe("replaced");
    expect(result.configuration).toBe("Release");
    expect(markerContents(podsRoot)).toBe("Release");
  });

  test("trims a trailing newline on the marker file", () => {
    const { iosDir, podsRoot } = makeIosTree();
    fs.writeFileSync(path.join(podsRoot, PREBUILT_DIR, ".last_build_configuration"), "Debug\n");
    const fake = fakeReactNative(podsRoot);
    const result = ensureIosRncoreConfiguration({
      configuration: "Debug",
      iosDir,
      ...fake,
    });
    expect(result.status).toBe("ok");
    expect(fake.calls).toEqual([]);
  });

  test("checkOnly reports a mismatch and does not spawn", () => {
    const { iosDir, podsRoot } = makeIosTree({ marker: "Release" });
    const fake = fakeReactNative(podsRoot);
    const result = ensureIosRncoreConfiguration({
      configuration: "Debug",
      iosDir,
      checkOnly: true,
      ...fake,
    });
    expect(result.status).toBe("mismatch");
    expect(fake.calls).toEqual([]);
    expect(markerContents(podsRoot)).toBe("Release");
  });

  test("runs pod install when the desired tarball is missing, then replaces", () => {
    const { iosDir, podsRoot } = makeIosTree({ tarballs: ["Release"] });
    const calls = [];
    const result = ensureIosRncoreConfiguration({
      configuration: "Debug",
      iosDir,
      resolveReactNative: () => ({
        version: "0.85.3",
        scriptPath: "/fake/replace-rncore-version.js",
      }),
      runPodInstall: (dir) => {
        calls.push({ kind: "pod-install", dir });
        fs.writeFileSync(tarballPath(podsRoot, "Debug"), "fake");
      },
      runReplace: ({ configuration }) => {
        calls.push({ kind: "replace", configuration });
        writeMarker(podsRoot, configuration);
      },
    });
    expect(result.status).toBe("replaced");
    expect(calls).toEqual([
      { kind: "pod-install", dir: iosDir },
      { kind: "replace", configuration: "Debug" },
    ]);
  });

  test("does not run pod install when replace fails and the tarball exists", () => {
    const { iosDir, podsRoot } = makeIosTree({ marker: "Release" });
    let podInstallCalls = 0;
    expect(() =>
      ensureIosRncoreConfiguration({
        configuration: "Debug",
        iosDir,
        resolveReactNative: () => ({
          version: "0.85.3",
          scriptPath: "/fake/replace-rncore-version.js",
        }),
        runReplace: () => {
          throw new Error("tar extraction failed with exit code 2");
        },
        runPodInstall: () => {
          podInstallCalls += 1;
        },
      }),
    ).toThrow(/tar extraction failed with exit code 2/);
    expect(podInstallCalls).toBe(0);
    expect(fs.existsSync(tarballPath(podsRoot, "Debug"))).toBe(true);
  });

  test("rejects an invalid configuration", () => {
    expect(() =>
      ensureIosRncoreConfiguration({ configuration: "Profile", iosDir: "/tmp" }),
    ).toThrow(/Debug" or "Release/);
  });

  test("fails closed if replace leaves the marker unmatched", () => {
    const { iosDir } = makeIosTree({ marker: "Release" });
    expect(() =>
      ensureIosRncoreConfiguration({
        configuration: "Debug",
        iosDir,
        resolveReactNative: () => ({
          version: "0.85.3",
          scriptPath: "/fake/replace-rncore-version.js",
        }),
        runReplace: () => {},
        runPodInstall: () => {
          throw new Error("pod install should not run");
        },
      }),
    ).toThrow(/marker is Release after replace/);
  });
});

describe("parseArgs", () => {
  test("reads configuration, ios dir, and check flag", () => {
    expect(parseArgs(["node", "script", "Release", "--ios-dir", "/tmp/ios", "--check"])).toEqual({
      configuration: "Release",
      iosDir: "/tmp/ios",
      checkOnly: true,
    });
  });
});

describe("justfile and build_and_run wiring", () => {
  const repoRoot = path.join(__dirname, "../../..");
  const justfile = fs.readFileSync(path.join(repoRoot, "justfile"), "utf8");
  const buildAndRun = fs.readFileSync(path.join(__dirname, "build_and_run.sh"), "utf8");

  test("Release and Debug just recipes isolate DerivedData and restore Debug pods", () => {
    expect(justfile).toContain("ensure-ios-rncore-configuration.js Release");
    expect(justfile).toContain("ensure-ios-rncore-configuration.js Debug");
    expect(justfile).toContain('derived="$ios_dir/DerivedData-Release"');
    expect(justfile).toContain('derived="$ios_dir/DerivedData-Debug"');
    expect(justfile).toContain("-derivedDataPath");
    expect(justfile).toContain("restore_debug_rncore");
  });

  test("prepare does not extract Debug before a Release swap", () => {
    const prepareStart = justfile.indexOf("\nmobile-ios-prepare:");
    const releaseStart = justfile.indexOf("\nmobile-ios-release *args:");
    const devStart = justfile.indexOf("\nmobile-ios-dev *args:");
    expect(prepareStart).toBeGreaterThan(-1);
    expect(releaseStart).toBeGreaterThan(prepareStart);
    expect(devStart).toBeGreaterThan(releaseStart);
    const prepare = justfile.slice(prepareStart, releaseStart);
    expect(prepare).not.toContain("ensure-ios-rncore-configuration.js");
    const release = justfile.slice(releaseStart, devStart);
    expect(release).toContain("just mobile-ios-prepare");
    expect(release).toContain("ensure-ios-rncore-configuration.js Release");
    expect(release).toContain("restore_debug_rncore");
  });

  test("expo run:ios goes through the Debug ensure helper", () => {
    expect(buildAndRun).toContain("ensure-ios-rncore-configuration.js");
    expect(buildAndRun).toContain("Debug");
  });
});
