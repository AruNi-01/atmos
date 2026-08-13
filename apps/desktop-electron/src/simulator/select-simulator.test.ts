import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSimctlRuntimes, parseSimctlSimulators } from "./parse-simctl.ts";
import { selectSimulator } from "./select.ts";

const fixtures = join(import.meta.dir, "__fixtures__");
const runtimes = parseSimctlRuntimes(
  readFileSync(join(fixtures, "simctl-runtimes-ok.json"), "utf8"),
);
const simulators = parseSimctlSimulators(
  readFileSync(join(fixtures, "simctl-list-ok.json"), "utf8"),
  runtimes,
);

describe("selectSimulator", () => {
  it("prefers last-used when still present with an available runtime", () => {
    const result = selectSimulator({
      lastUsedId: "CCCC-OLDER",
      runtimes,
      simulators,
    });
    expect(result).toEqual({
      action: "use",
      simulator: expect.objectContaining({ id: "CCCC-OLDER" }),
    });
  });

  it("picks the first iPhone on the newest runtime when last-used is gone", () => {
    const result = selectSimulator({
      lastUsedId: "GONE",
      runtimes,
      simulators,
    });
    expect(result?.action).toBe("use");
    if (result?.action === "use") {
      expect(result.simulator.id).toBe("AAAA-NEWEST");
      expect(result.simulator.runtimeId).toContain("iOS-18-5");
    }
  });

  it("creates on the newest runtime when no iPhone exists", () => {
    const padsOnly = simulators.filter((s) => s.id === "BBBB-IPAD");
    const result = selectSimulator({
      runtimes,
      simulators: padsOnly,
      typeIds: [
        "com.apple.CoreSimulator.SimDeviceType.iPhone-16",
        "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4",
      ],
    });
    expect(result).toEqual({
      action: "create",
      runtimeId: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
      runtimeName: "iOS 18.5",
      typeId: "com.apple.CoreSimulator.SimDeviceType.iPhone-16",
    });
  });

  it("has no curated tier ranking table", () => {
    const src = readFileSync(join(import.meta.dir, "select.ts"), "utf8");
    expect(src).not.toMatch(/Pro Max/);
    expect(src).not.toMatch(/ranking/);
  });
});
