import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMemoryRunner, failResult, okResult } from "./command-runner.ts";
import { probeSimulator } from "./probe.ts";
import type { ProbeHost } from "./types.ts";

const fixtures = join(import.meta.dir, "__fixtures__");
const runtimesOk = readFileSync(join(fixtures, "simctl-runtimes-ok.json"), "utf8");
const runtimesEmpty = readFileSync(
  join(fixtures, "simctl-runtimes-empty.json"),
  "utf8",
);
const listOk = readFileSync(join(fixtures, "simctl-list-ok.json"), "utf8");
const listNoIosHandset = readFileSync(
  join(fixtures, "simctl-list-no-iphone.json"),
  "utf8",
);
const listNone = readFileSync(join(fixtures, "simctl-list-no-runtime.json"), "utf8");
const listBooted = readFileSync(join(fixtures, "simctl-list-booted.json"), "utf8");

const macHost: ProbeHost = {
  platform: "darwin",
  arch: "arm64",
  macosVersion: "14.4.1",
};

function runnerFor(list: string, runtimes = runtimesOk) {
  return createMemoryRunner((cmd, args) => {
    const joined = `${cmd} ${args.join(" ")}`;
    if (joined.startsWith("xcrun simctl help")) return okResult("simctl");
    if (joined.startsWith("xcrun simctl list runtimes")) return okResult(runtimes);
    if (joined.startsWith("xcrun simctl list")) return okResult(list);
    if (cmd === "xcode-select") return okResult("/Applications/Xcode.app/Contents/Developer");
    if (cmd === "xcodebuild") return okResult("Xcode 16.4\nBuild version 16F6");
    if (cmd === "sw_vers") return okResult("14.4.1");
    return failResult(`unexpected ${joined}`);
  });
}

describe("probeSimulator", () => {
  it("returns platform_not_macos off darwin", async () => {
    const runner = runnerFor(listOk);
    const result = await probeSimulator({
      runner,
      host: { ...macHost, platform: "linux" },
      helperPresent: true,
    });
    expect(result.code).toBe("platform_not_macos");
    expect(runner.calls.some((c) => c.args.includes("boot"))).toBe(false);
  });

  it("returns helper_arch_unsupported on x86_64", async () => {
    const result = await probeSimulator({
      runner: runnerFor(listOk),
      host: { ...macHost, arch: "x64" },
      helperPresent: true,
    });
    expect(result.code).toBe("helper_arch_unsupported");
  });

  it("returns macos_too_old on macOS 13", async () => {
    const result = await probeSimulator({
      runner: runnerFor(listOk),
      host: { ...macHost, macosVersion: "13.6.1" },
      helperPresent: true,
    });
    expect(result.code).toBe("macos_too_old");
  });

  it("returns missing_simctl when xcrun simctl fails", async () => {
    const runner = createMemoryRunner((cmd, args) => {
      if (cmd === "xcrun" && args[0] === "simctl") return failResult("not found", 72);
      return okResult();
    });
    const result = await probeSimulator({
      runner,
      host: macHost,
      helperPresent: true,
    });
    expect(result.code).toBe("missing_simctl");
  });

  it("returns missing_ios_runtime when no iOS runtime is available", async () => {
    const result = await probeSimulator({
      runner: runnerFor(listNone, runtimesEmpty),
      host: macHost,
      helperPresent: true,
    });
    expect(result.code).toBe("missing_ios_runtime");
  });

  it("returns missing_iphone when only iPad entries exist", async () => {
    const result = await probeSimulator({
      runner: runnerFor(listNoIosHandset),
      host: macHost,
      helperPresent: true,
    });
    expect(result.code).toBe("missing_iphone");
  });

  it("returns helper_missing when the bundled payload is absent", async () => {
    const result = await probeSimulator({
      runner: runnerFor(listOk),
      host: macHost,
      helperPresent: false,
    });
    expect(result.code).toBe("helper_missing");
  });

  it("returns ok and never boots", async () => {
    const runner = runnerFor(listOk);
    const result = await probeSimulator({
      runner,
      host: macHost,
      helperPresent: true,
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBeNull();
    expect(result.facts.simulators.some((s) => s.id === "AAAA-NEWEST")).toBe(true);
    expect(
      runner.calls.some((c) => c.cmd === "xcrun" && c.args.includes("boot")),
    ).toBe(false);
  });

  it("runs capture smoke only when something is already Booted", async () => {
    const runner = runnerFor(listBooted);
    const result = await probeSimulator({
      runner,
      host: macHost,
      helperPresent: true,
      helperHealth: async () => ({ ok: false, mismatch: true }),
    });
    expect(result.code).toBe("capture_xcode_mismatch");
  });

  it("maps health failure without mismatch signatures to capture_failed", async () => {
    const result = await probeSimulator({
      runner: runnerFor(listBooted),
      host: macHost,
      helperPresent: true,
      helperHealth: async () => ({ ok: false, mismatch: false }),
    });
    expect(result.code).toBe("capture_failed");
  });
});
