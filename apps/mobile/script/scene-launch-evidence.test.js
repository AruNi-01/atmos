import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  judgeColdLaunch,
  judgePrebuilt,
  listAtmosIps,
  newAtmosIps,
} from "./scene-launch-evidence.js";

const SCRIPT = path.join(__dirname, "verify-ios-scene-lifecycle.sh");
const CLEAN_POD_LOG = [
  "[ReactNativeDependencies] Building from source: false",
  "[ReactNativeCore] Building from source: false",
  "[ReactNativeDependencies] Using tarball from URL: https://repo1.maven.org/maven2/reactnative-dependencies-debug.tar.gz",
].join("\n");

function runScript(args) {
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "scene-launch-"));
}

function writeFile(dir, name, text) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

describe("judgePrebuilt", () => {
  test("accepts a release tarball when the log stayed on the prebuilt path", () => {
    const result = judgePrebuilt(CLEAN_POD_LOG, ["reactnative-dependencies-0.85.3-release.tar.gz"]);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test("does not treat Building from source: false as a source build", () => {
    const result = judgePrebuilt("Building from source: false\n", [
      "reactnative-dependencies-0.85.3-release.tar.gz",
    ]);
    expect(result.ok).toBe(true);
  });

  test("rejects Building from source: true even when the tarball is present", () => {
    const result = judgePrebuilt(
      `${CLEAN_POD_LOG}\n[ReactNativeCore] Building from source: true\n`,
      ["reactnative-dependencies-0.85.3-release.tar.gz"],
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join("\n")).toContain("network:");
    expect(result.reasons.join("\n")).toContain("Building from source: true");
  });

  test("rejects No prebuilt artifacts found", () => {
    const result = judgePrebuilt(
      "No prebuilt artifacts found, reverting to building from source.\n",
      ["reactnative-dependencies-0.85.3-release.tar.gz"],
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join("\n")).toContain("missing prebuilt:");
    expect(result.reasons.join("\n")).toContain("No prebuilt artifacts found");
  });

  test("rejects a debug-only artifacts directory", () => {
    const result = judgePrebuilt(CLEAN_POD_LOG, ["reactnative-dependencies-0.85.3-debug.tar.gz"]);
    expect(result.ok).toBe(false);
    expect(result.reasons.join("\n")).toContain("reactnative-dependencies-*-release.tar.gz");
  });
});

describe("judgeColdLaunch", () => {
  const oldIps = ["/tmp/reports/Atmos-2026-10-18-010000.ips"];
  const launch = "land.atmos.mobile: 4242\n";

  test("passes when the pid stays up, the wait is at least 3s, and no new ips appeared", () => {
    const result = judgeColdLaunch({
      label: "ios27",
      launchStatus: 0,
      launchOutput: launch,
      alive: "1",
      waitedSeconds: "4",
      runtimeLog: "Atmos[4242] scene connected\n",
      beforeIps: oldIps,
      afterIps: oldIps,
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("fails a launch exit 0 whose process is already dead and left a new ips", () => {
    const result = judgeColdLaunch({
      label: "ios27",
      launchStatus: 0,
      launchOutput: launch,
      alive: "0",
      waitedSeconds: 4,
      runtimeLog: "Atmos[4242] scene connected\n",
      beforeIps: oldIps,
      afterIps: [...oldIps, "/tmp/reports/Atmos-2026-10-19-120000.ips"],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("process was not alive 4s after launch");
    expect(result.errors.join("\n")).toContain("Atmos-2026-10-19-120000.ips");
    expect(result.errors.join("\n")).not.toContain("Atmos-2026-10-18-010000.ips");
  });

  test("fails when the process dies even if the ips has not been written yet", () => {
    const result = judgeColdLaunch({
      label: "ios27",
      launchStatus: 0,
      launchOutput: launch,
      alive: false,
      waitedSeconds: 4,
      runtimeLog: "",
      beforeIps: oldIps,
      afterIps: oldIps,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("process was not alive 4s after launch");
  });

  test("fails on a new ips even when the pid is still alive", () => {
    const result = judgeColdLaunch({
      label: "ios27",
      launchStatus: 0,
      launchOutput: launch,
      alive: true,
      waitedSeconds: 4,
      runtimeLog: "",
      beforeIps: [],
      afterIps: ["/tmp/Retired/ExcUserFault_Atmos-2026-10-19-120001.ips"],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("ExcUserFault_Atmos-2026-10-19-120001.ips");
  });

  test("fails a wait under 3 seconds", () => {
    const result = judgeColdLaunch({
      label: "ios27",
      launchStatus: 0,
      launchOutput: launch,
      alive: "1",
      waitedSeconds: 2,
      runtimeLog: "",
      beforeIps: [],
      afterIps: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("process was not alive 2s after launch");
  });

  test("keeps the runtime-issue and EXC_BREAKPOINT failures", () => {
    const issue = judgeColdLaunch({
      label: "ios27",
      launchStatus: 0,
      launchOutput: launch,
      alive: "1",
      waitedSeconds: 4,
      runtimeLog: "UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption\n",
      beforeIps: [],
      afterIps: [],
    });
    expect(issue.ok).toBe(false);
    expect(issue.errors).toContain("UIKit reported no scene lifecycle");

    const breakpoint = judgeColdLaunch({
      label: "ios27",
      launchStatus: 0,
      launchOutput: "EXC_BREAKPOINT\n",
      alive: "1",
      waitedSeconds: 4,
      runtimeLog: "EXC_BREAKPOINT\n",
      beforeIps: [],
      afterIps: [],
    });
    expect(breakpoint.ok).toBe(false);
    expect(breakpoint.errors).toContain("cold launch did not stay up");
    expect(breakpoint.errors).toContain("EXC_BREAKPOINT in Atmos logs");
  });

  test("fails when the log names the missing React.framework", () => {
    const result = judgeColdLaunch({
      label: "ios27",
      launchStatus: 0,
      launchOutput: launch,
      alive: "1",
      waitedSeconds: 4,
      runtimeLog: "OS_REASON_DYLD | Library not loaded: @rpath/React.framework/React\n",
      beforeIps: [],
      afterIps: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("dyld did not load React.framework");
  });
});

describe("Atmos ips names", () => {
  test("counts Atmos crash reports and ignores Atmosphere and older copies", () => {
    const root = tempDir();
    writeFile(root, "Atmos-2026-10-18-010000.ips", "old");
    writeFile(root, "Atmosphere-2026.ips", "not a crash token");
    writeFile(root, "Retired/ExcUserFault_Atmos-2026-10-19-120001.ips", "new");
    writeFile(root, "notes.txt", "Atmos");
    const listed = listAtmosIps([root]);
    expect(listed.map((file) => path.basename(file)).sort()).toEqual([
      "Atmos-2026-10-18-010000.ips",
      "ExcUserFault_Atmos-2026-10-19-120001.ips",
    ]);
    const added = newAtmosIps([path.join(root, "Atmos-2026-10-18-010000.ips")], listed);
    expect(added).toEqual(["ExcUserFault_Atmos-2026-10-19-120001.ips"]);
  });
});

describe("verify script", () => {
  test("checks prebuilts before either simulator runtime and documents exit codes", () => {
    const script = fs.readFileSync(SCRIPT, "utf8");
    expect(script).toContain("0  PASS");
    expect(script).toContain("1  FAIL");
    expect(script).toContain("2  NOT RUN");
    const sim = script.slice(script.indexOf("simulator() {"), script.indexOf('\nmode="'));
    const judge = sim.indexOf("judge-prebuilt");
    const install = sim.indexOf('install_and_verify "$udid27"');
    expect(judge).toBeGreaterThan(sim.indexOf("pod install"));
    expect(install).toBeGreaterThan(judge);
    expect(sim).toContain("exit 2");
    expect(sim).toContain('install_and_verify "$udid26" "ios26" || failed=1');
    expect(sim).not.toContain("xcodebuild");
    const cold = script.slice(
      script.indexOf("assert_cold_launch() {"),
      script.indexOf("assert_deep_links() {"),
    );
    const snapshot = script.slice(
      script.indexOf("snapshot_atmos_ips() {"),
      script.indexOf("assert_cold_launch() {"),
    );
    expect(cold).toContain('sleep "$COLD_LAUNCH_WAIT_SECONDS"');
    expect(cold).toContain("kill -0");
    expect(cold).toContain("snapshot_atmos_ips");
    expect(snapshot).toContain("list-ips");
    expect(cold).toContain("judge-cold");
    expect(cold).toContain("ATMOS_DIAGNOSTIC_REPORTS");
    expect(cold).toContain("Library/Logs/DiagnosticReports");
    expect(cold).not.toContain('echo "PASS ${label}: cold launch"');
    expect(script).toContain("COLD_LAUNCH_WAIT_SECONDS=4");
    expect(script).toContain('scene-deep-link-evidence.js" judge');
  });

  test("judge-prebuilt exits 2 for a source build and does not say PASS", () => {
    const dir = tempDir();
    const log = writeFile(
      dir,
      "pod.log",
      `${CLEAN_POD_LOG}\n[ReactNativeCore] Building from source: true\n`,
    );
    const artifacts = path.join(dir, "artifacts");
    fs.mkdirSync(artifacts);
    writeFile(artifacts, "reactnative-dependencies-0.85.3-release.tar.gz", "tarball");
    const result = runScript(["judge-prebuilt", log, artifacts]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("NOT RUN:");
    expect(result.stderr).toContain("network");
    expect(result.stderr).toContain("Building from source: true");
    expect(`${result.stdout}${result.stderr}`).not.toContain("PASS");
  });

  test("judge-prebuilt exits 2 when the log says no prebuilt artifacts", () => {
    const dir = tempDir();
    const log = writeFile(
      dir,
      "pod.log",
      "No prebuilt artifacts found, reverting to building from source.\n",
    );
    const artifacts = path.join(dir, "artifacts");
    fs.mkdirSync(artifacts);
    writeFile(artifacts, "reactnative-dependencies-0.85.3-release.tar.gz", "tarball");
    const result = runScript(["judge-prebuilt", log, artifacts]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("NOT RUN:");
    expect(result.stderr).toContain("missing prebuilt");
    expect(result.stderr).toContain("No prebuilt artifacts found");
  });

  test("judge-prebuilt exits 2 when the release tarball is missing", () => {
    const dir = tempDir();
    const log = writeFile(dir, "pod.log", CLEAN_POD_LOG);
    const artifacts = path.join(dir, "artifacts");
    fs.mkdirSync(artifacts);
    writeFile(artifacts, "reactnative-dependencies-0.85.3-debug.tar.gz", "debug");
    const result = runScript(["judge-prebuilt", log, artifacts]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("NOT RUN:");
    expect(result.stderr).toContain("missing prebuilt");
    expect(result.stderr).toContain("reactnative-dependencies-*-release.tar.gz");
    expect(result.status).not.toBe(0);
    expect(result.status).not.toBe(1);
  });

  test("judge-prebuilt exits 0 when the release tarball is present and the log is clean", () => {
    const dir = tempDir();
    const log = writeFile(dir, "pod.log", CLEAN_POD_LOG);
    const artifacts = path.join(dir, "ReactNativeDependencies-artifacts");
    fs.mkdirSync(artifacts);
    writeFile(artifacts, "reactnative-dependencies-0.85.3-release.tar.gz", "release");
    const result = runScript(["judge-prebuilt", log, artifacts]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("prebuilt ok: reactnative-dependencies-0.85.3-release.tar.gz");
    expect(result.stderr).not.toContain("NOT RUN");
  });

  test("judge-cold does not pass the dyld-shaped launch", () => {
    const dir = tempDir();
    const reports = path.join(dir, "DiagnosticReports");
    writeFile(reports, "Atmos-2026-10-18-010000.ips", "old");
    writeFile(reports, "Retired/Atmosphere-2026.ips", "not counted");
    const before = runScript(["list-ips", reports]);
    expect(before.status).toBe(0);
    writeFile(reports, "Atmos-2026-10-19-120000.ips", "dyld");
    writeFile(reports, "Retired/ExcUserFault_Atmos-2026-10-19-120001.ips", "dyld");
    const after = runScript(["list-ips", reports]);
    expect(after.stdout).toContain("Atmos-2026-10-19-120000.ips");
    expect(after.stdout).toContain("ExcUserFault_Atmos-2026-10-19-120001.ips");
    expect(after.stdout).not.toContain("Atmosphere-2026.ips");
    const launch = writeFile(dir, "launch.txt", "land.atmos.mobile: 4242\n");
    const runtime = writeFile(dir, "runtime.txt", "Atmos[4242] started\n");
    const beforeFile = writeFile(dir, "before.txt", before.stdout);
    const afterFile = writeFile(dir, "after.txt", after.stdout);
    const result = runScript([
      "judge-cold",
      "ios27",
      "0",
      launch,
      "0",
      "4",
      runtime,
      beforeFile,
      afterFile,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("FAIL ios27: process was not alive 4s after launch");
    expect(result.stderr).toContain("FAIL ios27: new Atmos crash report:");
    expect(result.stderr).toContain("Atmos-2026-10-19-120000.ips");
    expect(result.stderr).not.toContain("Atmos-2026-10-18-010000.ips");
    expect(`${result.stdout}${result.stderr}`).not.toContain("PASS ios27: cold launch");
  });

  test("judge-cold passes only a live process with no new ips", () => {
    const dir = tempDir();
    const reports = path.join(dir, "DiagnosticReports");
    writeFile(reports, "Atmos-2026-10-18-010000.ips", "old");
    const listed = runScript(["list-ips", reports]);
    const listFile = writeFile(dir, "ips.txt", listed.stdout);
    const launch = writeFile(dir, "launch.txt", "warning\nland.atmos.mobile: 4242\n");
    const runtime = writeFile(dir, "runtime.txt", "Atmos[4242] scene connected\n");
    const result = runScript([
      "judge-cold",
      "ios27",
      "0",
      launch,
      "1",
      "4",
      runtime,
      listFile,
      listFile,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS ios27: cold launch");
    expect(result.stderr).not.toContain("FAIL");
  });

  test("judge-cold fails a live process that still wrote a new ips", () => {
    const dir = tempDir();
    const beforeFile = writeFile(dir, "before.txt", "/tmp/Atmos-2026-10-18-010000.ips\n");
    const afterFile = writeFile(
      dir,
      "after.txt",
      "/tmp/Atmos-2026-10-18-010000.ips\n/tmp/Atmos-2026-10-19-120000.ips\n",
    );
    const launch = writeFile(dir, "launch.txt", "land.atmos.mobile: 4242\n");
    const runtime = writeFile(dir, "runtime.txt", "\n");
    const result = runScript([
      "judge-cold",
      "ios27",
      "0",
      launch,
      "1",
      "4",
      runtime,
      beforeFile,
      afterFile,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("new Atmos crash report");
    expect(`${result.stdout}${result.stderr}`).not.toContain("PASS ios27: cold launch");
  });

  test("parse-launch-pid reads the simctl pid line", () => {
    const dir = tempDir();
    const launch = writeFile(dir, "launch.txt", "warning\nland.atmos.mobile: 4242\n");
    const result = runScript(["parse-launch-pid", launch]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("4242\n");
    const missing = writeFile(dir, "empty.txt", "no pid here\n");
    const none = runScript(["parse-launch-pid", missing]);
    expect(none.status).toBe(0);
    expect(none.stdout).toBe("");
  });

  test("structural and built-plist still fail with exit 1", () => {
    const structural = runScript(["structural"]);
    expect(structural.status).toBe(1);
    expect(structural.stderr).toContain("Missing");
    expect(structural.stderr).not.toContain("NOT RUN");
    const built = runScript(["built-plist"]);
    expect(built.status).toBe(1);
    expect(built.stderr).toContain("built-plist needs a path");
  });

  test("simulator without xcrun is NOT RUN exit 2 and does not build", () => {
    const which = spawnSync("bash", ["-lc", "command -v xcrun"], { encoding: "utf8" });
    expect(which.status).not.toBe(0);
    const result = runScript(["simulator"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("NOT RUN: simulator. xcrun is not available");
    expect(`${result.stdout}${result.stderr}`).not.toContain("PASS");
    expect(`${result.stdout}${result.stderr}`).not.toContain("pod install");
  });
});
