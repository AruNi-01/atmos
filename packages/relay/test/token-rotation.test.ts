import { describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

function rotationEnv(options: { updateChanges: number }) {
  const calls: Array<{ sql: string; args: unknown[]; op?: "first" | "run" }> = [];
  let authLookupCount = 0;
  let batchCalled = false;

  return {
    calls,
    get batchCalled() {
      return batchCalled;
    },
    env: {
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              const call: { sql: string; args: unknown[]; op?: "first" | "run" } = { sql, args };
              calls.push(call);
              return {
                async first() {
                  call.op = "first";
                  if (sql.includes("SELECT tenant_id FROM tenants WHERE access_token_hash")) {
                    authLookupCount += 1;
                    return authLookupCount === 1 ? { tenant_id: "tenant_1" } : null;
                  }
                  if (sql.includes("SELECT updated_at, rotated_at")) {
                    return { updated_at: 111, rotated_at: null };
                  }
                  if (sql.includes("sqlite_master")) {
                    return null;
                  }
                  return null;
                },
                async run() {
                  call.op = "run";
                  return { meta: { changes: options.updateChanges } };
                },
              };
            },
          };
        },
        async batch() {
          batchCalled = true;
          return [];
        },
      },
      SERVER_HUB: {
        idFromName: () => "server_1",
        get: () => ({ fetch: async () => new Response(null) }),
      },
    },
  };
}

describe("tenant access token rotation", () => {
  test("does not run cleanup statements when the guarded update conflicts", async () => {
    const harness = rotationEnv({ updateChanges: 0 });
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/tenants/rotate_token", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ new_token: "b".repeat(32) }),
      }),
      harness.env as never,
      {} as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "rotation_conflict" });
    expect(harness.batchCalled).toBe(false);
  });
});
