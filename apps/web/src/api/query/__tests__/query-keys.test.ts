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
    expect(queryKeys.computer.quotaOverview(scope)).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
      "quota",
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
      { year: null, since: null, until: null, clients: null, groupBy: null },
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
    expect(queryKeys.computer.filesRoot(scope)).toEqual([
      "atmos", "computer", "local", 2, 3, "files",
    ]);
    expect(queryKeys.computer.fileTree(scope, "/root", false)).toEqual([
      "atmos", "computer", "local", 2, 3, "files", "/root", "tree", { showHidden: false },
    ]);
    expect(queryKeys.computer.fileTree(scope, "/root", true)).toEqual([
      "atmos", "computer", "local", 2, 3, "files", "/root", "tree", { showHidden: true },
    ]);
    expect(queryKeys.computer.listDir(scope, "/dir")).toEqual([
      "atmos", "computer", "local", 2, 3, "files", "/dir", "dir",
      { dirsOnly: true, showHidden: false },
    ]);
    expect(queryKeys.computer.readFile(scope, "/path/to/file.ts")).toEqual([
      "atmos", "computer", "local", 2, 3, "files", "/path/to/file.ts", "content",
    ]);
    expect(queryKeys.computer.searchContent(scope, "/root", "hello")).toEqual([
      "atmos", "computer", "local", 2, 3, "files", "/root", "search", "content",
      { query: "hello", maxResults: 50, caseSensitive: false },
    ]);
    expect(queryKeys.computer.searchDirs(scope, "/root", "src")).toEqual([
      "atmos", "computer", "local", 2, 3, "files", "/root", "search", "dirs",
      { query: "src", maxResults: 50, maxDepth: 4 },
    ]);
  });

  test("usage overview filter segment defaults providerId to null", () => {
    expect(queryKeys.computer.quotaOverview(scope, {})).toEqual(
      queryKeys.computer.quotaOverview(scope),
    );
    expect(queryKeys.computer.quotaOverview(scope, { providerId: "openai" })).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
      "quota",
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

  test("scoped token usage overview is isolated from the workbench computer key", () => {
    expect(queryKeys.computer.tokenUsageOverview(scope)).toEqual([
      "atmos",
      "computer",
      "local",
      2,
      3,
      "tokenUsage",
      "overview",
      { year: null, since: null, until: null, clients: null, groupBy: null },
    ]);
    expect(queryKeys.tokenUsage.scopedOverview(relayScope, "all")).toEqual([
      "atmos",
      "relay",
      "https://relay.atmos.land",
      1,
      "tokenUsage",
      "overview",
      "all",
      { year: null, since: null, until: null, clients: null, groupBy: null },
    ]);
  });

  test("public GitHub user card is not scoped to a computer", () => {
    expect(queryKeys.publicGithub.userCard("octocat")).toEqual([
      "atmos",
      "public",
      "github",
      "userCard",
      "octocat",
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
