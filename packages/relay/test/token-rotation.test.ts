import { describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

function upsertEnv() {
  const calls: Array<{ sql: string; args: unknown[]; op?: "run" }> = [];
  return {
    calls,
    env: {
      RELAY_HUB_SYNC_SECRET: "hub-sync-secret",
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              const call: { sql: string; args: unknown[]; op?: "run" } = { sql, args };
              calls.push(call);
              return {
                async first() {
                  return null;
                },
                async run() {
                  call.op = "run";
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
      SERVER_HUB: {
        idFromName: () => "server_1",
        get: () => ({ fetch: async () => new Response(null) }),
      },
    },
  };
}

describe("hub device projection", () => {
  test("upserts a device when Hub sync secret is valid", async () => {
    const harness = upsertEnv();
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/internal/devices/upsert", {
        method: "POST",
        headers: {
          Authorization: "Bearer hub-sync-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: "user_1",
          device_id: "dev_1",
          credential_hash: "a".repeat(64),
          label: "MacBook",
        }),
      }),
      harness.env as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      device_id: "dev_1",
    });
    expect(harness.calls.some((c) => c.sql.includes("INSERT INTO devices"))).toBe(true);
  });

  test("rejects upsert without hub sync secret", async () => {
    const harness = upsertEnv();
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/internal/devices/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "user_1",
          device_id: "dev_1",
          credential_hash: "a".repeat(64),
        }),
      }),
      harness.env as never,
      {} as never,
    );

    expect(response.status).toBe(401);
  });
});
