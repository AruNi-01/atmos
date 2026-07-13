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
  test("reconnectInvalidationKeys covers system, settings, and usage roots", () => {
    expect(reconnectInvalidationKeys(scope)).toEqual([
      queryKeys.computer.system(scope),
      queryKeys.computer.settingsBootstrap(scope),
      queryKeys.computer.usageOverview(scope),
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
