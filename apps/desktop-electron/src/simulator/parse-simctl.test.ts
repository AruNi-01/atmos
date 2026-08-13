import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSimctlSimulators,
  simulatorNeedsBoot,
} from "./parse-simctl.ts";

const fixtures = join(import.meta.dir, "__fixtures__");
const mixed = readFileSync(join(fixtures, "simctl-list-mixed-state.json"), "utf8");
const booted = readFileSync(join(fixtures, "simctl-list-booted.json"), "utf8");

describe("simulatorNeedsBoot", () => {
  it("boots a Shutdown target even when another simulator is Booted", () => {
    expect(simulatorNeedsBoot(mixed, "SHUTDOWN-TARGET")).toBe(true);
    expect(simulatorNeedsBoot(mixed, "BOOTED-OTHER")).toBe(false);
    expect(parseSimctlSimulators(mixed, []).map((row) => row.id)).toEqual([
      "SHUTDOWN-TARGET",
      "BOOTED-OTHER",
    ]);
  });

  it("boots when the chosen id is missing", () => {
    expect(simulatorNeedsBoot(booted, "MISSING")).toBe(true);
    expect(simulatorNeedsBoot(booted, "BOOTED-1")).toBe(false);
  });
});
