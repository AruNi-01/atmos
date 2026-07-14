import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import {
  invalidateAfterComputerReconnect,
  reconnectInvalidationKeys,
} from "@/api/query/reconnect-invalidation";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { createAtmosWebQueryClient } from "@/providers/app/query-client";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 2,
  relaySessionRevision: 1,
};

describe("reconnect-invalidation", () => {
  test("reconnectInvalidationKeys covers Query-owned reconnect-sensitive roots", () => {
    expect(reconnectInvalidationKeys(scope)).toEqual([
      queryKeys.computer.system(scope),
      queryKeys.computer.settingsBootstrap(scope),
      queryKeys.computer.usageOverview(scope),
      [...queryKeys.computer.root(scope), "tokenUsage"],
      queryKeys.computer.projectBootstrap(scope),
      queryKeys.computer.filesRoot(scope),
      queryKeys.computer.gitAll(scope),
      queryKeys.computer.skillsList(scope),
      queryKeys.computer.automationList(scope),
      [...queryKeys.computer.root(scope), "automations"],
      [...queryKeys.computer.root(scope), "github"],
      [...queryKeys.computer.root(scope), "review"],
      [...queryKeys.computer.root(scope), "localModels"],
      [...queryKeys.computer.root(scope), "localServices"],
      [...queryKeys.computer.root(scope), "agentRegistry"],
    ]);
  });

  test("invalidateAfterComputerReconnect marks registered keys stale", async () => {
    const client = createAtmosWebQueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const keys = reconnectInvalidationKeys(scope);

    for (const queryKey of keys) {
      client.setQueryData(queryKey, { ok: true });
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
    }

    await invalidateAfterComputerReconnect(client, scope);

    for (const queryKey of keys) {
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
      expect(client.getQueryData(queryKey)).toEqual({ ok: true });
    }
  });
});
