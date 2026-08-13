import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SimulatorClaim } from "./types.ts";
import {
  listedHelperFromStateRecordRaw,
  parseHelperList,
  planOrphanKills,
} from "./orphan.ts";

function claim(
  workspaceId: string,
  instanceId: string,
  desktopPid: number,
  extra: Partial<SimulatorClaim> = {},
): SimulatorClaim {
  return { workspaceId, instanceId, desktopPid, since: "t0", ...extra };
}

describe("orphan reconcile plan", () => {
  it("parses helper --list JSON including the upstream device field", () => {
    const listed = parseHelperList(
      JSON.stringify([
        { pid: 10, device: "UDID-A", port: 1 },
        { pid: 11, udid: "UDID-B", port: 2 },
      ]),
    );
    expect(listed).toEqual([
      { pid: 10, simulatorId: "UDID-A", port: 1 },
      { pid: 11, simulatorId: "UDID-B", port: 2 },
    ]);
    expect(parseHelperList("{")).toEqual([]);
    expect(
      parseHelperList(JSON.stringify({ streams: [{ pid: 12, simulatorId: "UDID-C" }] })),
    ).toEqual([{ pid: 12, simulatorId: "UDID-C", port: undefined }]);
  });

  it("reads leftover helper state records as listed streams", () => {
    const raw = readFileSync(
      join(import.meta.dir, "__fixtures__", "helper-state-record.json"),
      "utf8",
    );
    expect(listedHelperFromStateRecordRaw(raw)).toEqual({
      pid: 4242,
      simulatorId: "AAAA-NEWEST",
      port: 49152,
    });
  });

  it("keeps helpers owned by another live Desktop pid", () => {
    const plan = planOrphanKills({
      listed: [{ pid: 50, simulatorId: "UDID-A", port: 1 }],
      claims: { "UDID-A": claim("ws-a", "inst-a", 100) },
      sessionHelperPids: new Set(),
      sessionSimulatorIds: new Set(),
      selfPid: 200,
      isPidAlive: (pid) => pid === 100,
    });
    expect(plan.killSimulatorIds).toEqual([]);
    expect(plan.dropClaimIds).toEqual([]);
  });

  it("kills leftovers whose claim pid is dead, and this process's unattached claims", () => {
    const plan = planOrphanKills({
      listed: [
        { pid: 50, simulatorId: "UDID-DEAD", port: 1 },
        { pid: 51, simulatorId: "UDID-SELF", port: 2 },
      ],
      claims: {
        "UDID-DEAD": claim("ws-a", "inst-a", 9),
        "UDID-SELF": claim("ws-b", "inst-self", 200),
        "UDID-STALE": claim("ws-c", "inst-old", 8),
      },
      sessionHelperPids: new Set(),
      sessionSimulatorIds: new Set(),
      selfPid: 200,
      isPidAlive: (pid) => pid === 200,
    });
    expect(plan.killSimulatorIds).toEqual(["UDID-DEAD", "UDID-SELF"]);
    expect(plan.dropClaimIds).toEqual(["UDID-DEAD", "UDID-SELF", "UDID-STALE"]);
  });

  it("does not kill helpers already in this process's session map", () => {
    const plan = planOrphanKills({
      listed: [{ pid: 50, simulatorId: "UDID-A", port: 1 }],
      claims: { "UDID-A": claim("ws-a", "inst-self", 200, { helperPid: 50 }) },
      sessionHelperPids: new Set([50]),
      sessionSimulatorIds: new Set(["UDID-A"]),
      selfPid: 200,
      isPidAlive: (pid) => pid === 200,
    });
    expect(plan.killSimulatorIds).toEqual([]);
    expect(plan.dropClaimIds).toEqual([]);
  });

  it("SIGTERMs listed helpers that have no udid and no live owner", () => {
    const plan = planOrphanKills({
      listed: [{ pid: 77, port: 3 }],
      claims: {},
      sessionHelperPids: new Set(),
      sessionSimulatorIds: new Set(),
      selfPid: 200,
      isPidAlive: () => false,
    });
    expect(plan.killPids).toEqual([77]);
    expect(plan.killSimulatorIds).toEqual([]);
  });

  it("does not blanket-kill in the bridge", () => {
    const src = readFileSync(join(import.meta.dir, "bridge.ts"), "utf8");
    expect(src).not.toContain('helperCli(["--kill"])');
  });
});
