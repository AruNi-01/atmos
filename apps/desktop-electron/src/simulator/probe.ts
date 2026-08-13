import { HELPER_ARCH, HELPER_MIN_MACOS } from "./pin.ts";
import type { CommandRunner } from "./command-runner.ts";
import {
  compareVersions,
  isSelectableIosHandset,
  parseMacosVersion,
  parseSimctlRuntimes,
  parseSimctlSimulators,
} from "./parse-simctl.ts";
import type {
  ProbeFacts,
  ProbeHost,
  ProbeResult,
  ProbeRuntime,
  ProbeSimulator,
} from "./types.ts";

export type ProbeDeps = {
  runner: CommandRunner;
  host: ProbeHost;
  helperPresent: boolean;
  helperVersion?: string;
  /** Capture smoke: only consulted when a simulator is already Booted. */
  helperHealth?: () => Promise<{ ok: boolean; mismatch?: boolean }>;
};

async function runOrEmpty(
  runner: CommandRunner,
  cmd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    return await runner(cmd, args);
  } catch (error) {
    return {
      code: 127,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

function emptyFacts(host: ProbeHost, helperVersion?: string): ProbeFacts {
  return {
    macosVersion: host.macosVersion,
    arch: host.arch,
    helperVersion,
    runtimes: [],
    simulators: [],
  };
}

function fail(
  code: ProbeResult["code"],
  facts: ProbeFacts,
): ProbeResult {
  return { ok: false, code, facts };
}

export async function probeSimulator(deps: ProbeDeps): Promise<ProbeResult> {
  const { runner, host } = deps;
  let facts = emptyFacts(host, deps.helperVersion);

  if (host.platform !== "darwin") {
    return fail("platform_not_macos", facts);
  }
  if (host.arch !== HELPER_ARCH) {
    return fail("helper_arch_unsupported", facts);
  }

  let macosVersion = host.macosVersion?.trim() || "";
  if (!macosVersion) {
    const ver = await runOrEmpty(runner, "sw_vers", ["-productVersion"]);
    macosVersion = ver.stdout.trim();
  }
  facts = { ...facts, macosVersion };
  const parsed = parseMacosVersion(macosVersion);
  const min = parseMacosVersion(HELPER_MIN_MACOS);
  if (!parsed || !min || compareVersions(parsed, min) < 0) {
    return fail("macos_too_old", facts);
  }

  const simctl = await runOrEmpty(runner, "xcrun", ["simctl", "help"]);
  if (simctl.code !== 0) {
    return fail("missing_simctl", facts);
  }

  const xcodePath = await runOrEmpty(runner, "xcode-select", ["-p"]);
  const xcodeVer = await runOrEmpty(runner, "xcodebuild", ["-version"]);
  facts = {
    ...facts,
    xcodePath: xcodePath.code === 0 ? xcodePath.stdout.trim() : undefined,
    xcodeVersion:
      xcodeVer.code === 0
        ? xcodeVer.stdout.trim().split("\n")[0]?.trim()
        : undefined,
  };

  const runtimeList = await runOrEmpty(runner, "xcrun", [
    "simctl",
    "list",
    "runtimes",
    "-j",
  ]);
  const runtimes: ProbeRuntime[] = parseSimctlRuntimes(runtimeList.stdout);
  const availableIos = runtimes.filter(
    (r) => r.isAvailable && r.platform.toLowerCase() === "ios",
  );
  facts = { ...facts, runtimes };
  if (availableIos.length === 0) {
    return fail("missing_ios_runtime", facts);
  }

  const list = await runOrEmpty(runner, "xcrun", ["simctl", "list", "-j"]);
  const simulators: ProbeSimulator[] = parseSimctlSimulators(
    list.stdout,
    runtimes,
  );
  facts = { ...facts, simulators };
  const bootable = simulators.filter(
    (s) =>
      s.isAvailable &&
      isSelectableIosHandset(s) &&
      availableIos.some((r) => r.identifier === s.runtimeId || r.name === s.runtimeName),
  );
  if (bootable.length === 0) {
    return fail("missing_iphone", facts);
  }

  if (!deps.helperPresent) {
    return fail("helper_missing", facts);
  }

  const alreadyBooted = bootable.some((s) => s.state === "Booted");
  if (alreadyBooted && deps.helperHealth) {
    const health = await deps.helperHealth();
    if (!health.ok) {
      return fail(
        health.mismatch ? "capture_xcode_mismatch" : "capture_failed",
        facts,
      );
    }
  }

  return { ok: true, code: null, facts };
}
