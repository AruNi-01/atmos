import { describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

const DEVICE_TOKEN = "a".repeat(32);

function sqlIncludes(sql: string, snippet: string): boolean {
  return sql.replace(/\s+/g, " ").includes(snippet.replace(/\s+/g, " "));
}

function computerListEnv(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ sql: string; args: unknown[]; op?: string }> = [];
  return {
    calls,
    env: {
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              const call: { sql: string; args: unknown[]; op?: string } = { sql, args };
              calls.push(call);
              return {
                async first() {
                  call.op = "first";
                  if (sql.includes("SELECT device_id, user_id FROM devices")) {
                    return { device_id: "dev_1", user_id: "user_1" };
                  }
                  return null;
                },
                async all() {
                  call.op = "all";
                  return { results: rows };
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

function clientSessionEnv(options: { sessionCount?: number } = {}) {
  const calls: Array<{ sql: string; args: unknown[]; op?: string }> = [];
  return {
    calls,
    env: {
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              const call: { sql: string; args: unknown[]; op?: string } = { sql, args };
              calls.push(call);
              return {
                async first() {
                  call.op = "first";
                  if (sql.includes("SELECT device_id, user_id FROM devices")) {
                    return { device_id: "dev_1", user_id: "user_1" };
                  }
                  if (sql.includes("SELECT revoked FROM computers")) {
                    return { revoked: 0 };
                  }
                  if (sql.includes("SELECT COUNT(*) AS count FROM client_sessions")) {
                    return { count: options.sessionCount ?? 0 };
                  }
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

describe("GET /v1/computers app_device_id", () => {
  test("includes app_device_id on each computer", async () => {
    const appDeviceId = "ab".repeat(32);
    const harness = computerListEnv([
      {
        server_id: "srv_1",
        display_name: "Laptop",
        revoked: 0,
        created_at: 1,
        last_seen_at: 2,
        registration_meta: null,
        app_device_id: appDeviceId,
      },
      {
        server_id: "srv_2",
        display_name: "Legacy",
        revoked: 0,
        created_at: 1,
        last_seen_at: null,
        registration_meta: null,
        app_device_id: null,
      },
    ]);
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers", {
        method: "GET",
        headers: { Authorization: `Bearer ${DEVICE_TOKEN}` },
      }),
      harness.env as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      computers: [
        {
          server_id: "srv_1",
          display_name: "Laptop",
          revoked: 0,
          created_at: 1,
          last_seen_at: 2,
          registration_meta: null,
          online: true,
          app_device_id: appDeviceId,
        },
        {
          server_id: "srv_2",
          display_name: "Legacy",
          revoked: 0,
          created_at: 1,
          last_seen_at: null,
          registration_meta: null,
          online: false,
          app_device_id: null,
        },
      ],
    });
    expect(
      harness.calls.some((c) => c.sql.includes("app_device_id")),
    ).toBe(true);
  });
});

describe("POST client_sessions concurrent rows", () => {
  test("does not wipe sibling sessions for the same user and computer", async () => {
    const harness = clientSessionEnv({ sessionCount: 1 });
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv_1/client_sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEVICE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_kind: "web" }),
      }),
      harness.env as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { client_token?: string; ws_url?: string };
    expect(body.client_token).toBeTruthy();
    expect(body.ws_url).toContain("server_id=srv_1");

    const wipeAll = harness.calls.some(
      (c) =>
        sqlIncludes(c.sql, "DELETE FROM client_sessions WHERE server_id = ? AND user_id = ?") &&
        !c.sql.includes("rowid"),
    );
    expect(wipeAll).toBe(false);
    expect(
      harness.calls.some((c) => c.sql.includes("INSERT INTO client_sessions")),
    ).toBe(true);
    expect(
      harness.calls.some((c) =>
        sqlIncludes(c.sql, "DELETE FROM client_sessions WHERE rowid IN"),
      ),
    ).toBe(false);
  });

  test("drops the oldest sessions when the per-computer cap is exceeded", async () => {
    const harness = clientSessionEnv({ sessionCount: 8 });
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv_1/client_sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEVICE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_kind: "desktop" }),
      }),
      harness.env as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    const overflowDelete = harness.calls.find((c) =>
      sqlIncludes(c.sql, "DELETE FROM client_sessions WHERE rowid IN"),
    );
    expect(overflowDelete).toBeTruthy();
    expect(overflowDelete?.args).toEqual(["srv_1", "user_1", 1]);
  });
});
