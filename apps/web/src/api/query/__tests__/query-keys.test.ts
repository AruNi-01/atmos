import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope, RelayQueryScope } from "@/api/query/query-scope";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 2,
  relaySessionRevision: 3,
};

const relayScope: RelayQueryScope = {
  relayUrl: "https://relay.atmos.land",
  authRevision: 1,
};

describe("queryKeys", () => {
  test("computer root includes instance, epoch, and session revision", () => {
    expect(queryKeys.computer.root(scope)).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
    ]);
  });

  test("system diagnostics nest under computer system segment", () => {
    const system = queryKeys.computer.system(scope);
    expect(system).toEqual(["atmos", "computer", "local", 2, 3, "system"]);
    expect(queryKeys.computer.tmuxStatus(scope)).toEqual([...system, "tmuxStatus"]);
    expect(queryKeys.computer.runtimeInfo(scope)).toEqual([...system, "runtimeInfo"]);
    expect(queryKeys.computer.ghCliStatus(scope)).toEqual([...system, "ghCliStatus"]);
    expect(queryKeys.computer.terminalOverview(scope)).toEqual([
      ...system,
      "terminalOverview",
    ]);
    expect(queryKeys.computer.wsConnections(scope)).toEqual([...system, "wsConnections"]);
  });

  test("domain keys nest under computer root", () => {
    expect(queryKeys.computer.tmuxStatus(scope)[0]).toBe("atmos");
    expect(queryKeys.computer.tmuxStatus(scope).slice(0, 5)).toEqual(
      queryKeys.computer.root(scope) as unknown as string[],
    );
    expect(queryKeys.computer.settingsBootstrap(scope)).toContain("settings");
    expect(queryKeys.computer.usageOverview(scope)).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
      "usage",
      "overview",
      { providerId: null },
    ]);
    expect(queryKeys.computer.tokenUsageOverview(scope)).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
      "tokenUsage",
      "overview",
    ]);
    expect(queryKeys.computer.projectBootstrap(scope)).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
      "projects",
      "bootstrap",
    ]);
    expect(queryKeys.computer.git(scope, "/repo")).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
      "git",
      "/repo",
    ]);
    expect(queryKeys.computer.files(scope, "/root")).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
      "files",
      "/root",
    ]);
  });

  test("usage overview filter segment defaults providerId to null", () => {
    expect(queryKeys.computer.usageOverview(scope, {})).toEqual(
      queryKeys.computer.usageOverview(scope),
    );
    expect(queryKeys.computer.usageOverview(scope, { providerId: "openai" })).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
      "usage",
      "overview",
      { providerId: "openai" },
    ]);
  });

  test("relay root never includes secrets", () => {
    expect(queryKeys.relay.root(relayScope)).toEqual([
      "atmos",
      "relay",
      "https://relay.atmos.land",
      1,
    ]);
  });

  test("epoch or session revision change yields a different computer root", () => {
    expect(queryKeys.computer.root({ ...scope, connectionEpoch: 4 })).not.toEqual(
      queryKeys.computer.root(scope),
    );
    expect(queryKeys.computer.root({ ...scope, relaySessionRevision: 9 })).not.toEqual(
      queryKeys.computer.root(scope),
    );
    expect(
      queryKeys.computer.root({ ...scope, activeInstanceId: "relay:abc" }),
    ).not.toEqual(queryKeys.computer.root(scope));
  });
});
