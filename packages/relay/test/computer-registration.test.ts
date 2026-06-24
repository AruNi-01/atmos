import { describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

function computerRegisterEnv(options: { deviceRegistrationCount?: number } = {}) {
  const calls: Array<{ sql: string; args: unknown[]; op?: "first" | "run" }> = [];

  return {
    calls,
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
                  if (sql.includes("SELECT tenant_id FROM register_tokens")) {
                    return { tenant_id: "tenant_1" };
                  }
                  if (sql.includes("COUNT(*) AS count FROM computers")) {
                    return { count: options.deviceRegistrationCount ?? 0 };
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

describe("computer registration device limits", () => {
  test("requires an app device id before touching D1", async () => {
    const { default: worker } = await import("../src/index");
    const env = {
      DB: {
        prepare() {
          throw new Error("DB should not be touched without app_device_id");
        },
      },
      SERVER_HUB: {
        idFromName: () => "server_1",
        get: () => ({ fetch: async () => new Response(null) }),
      },
    };

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ register_token: "one-time-token" }),
      }),
      env as never,
      {} as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "app_device_id_required" });
  });

  test("rejects invalid app device ids before touching D1", async () => {
    const { default: worker } = await import("../src/index");
    const env = {
      DB: {
        prepare() {
          throw new Error("DB should not be touched for invalid app_device_id");
        },
      },
      SERVER_HUB: {
        idFromName: () => "server_1",
        get: () => ({ fetch: async () => new Response(null) }),
      },
    };

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          register_token: "one-time-token",
          device: { app_device_id: "not-hex" },
        }),
      }),
      env as never,
      {} as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_app_device_id" });
  });

  test("does not consume the register token when the device limit is exceeded", async () => {
    const appDeviceId = "a".repeat(64);
    const harness = computerRegisterEnv({ deviceRegistrationCount: 10 });
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          register_token: "one-time-token",
          device: { app_device_id: appDeviceId },
        }),
      }),
      harness.env as never,
      {} as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "computer_device_registration_limit_exceeded",
    });
    expect(
      harness.calls.some((call) => call.sql.includes("UPDATE register_tokens")),
    ).toBe(false);
    expect(
      harness.calls.some((call) => call.sql.includes("INSERT INTO computers")),
    ).toBe(false);
    expect(
      harness.calls.some(
        (call) =>
          call.sql.includes("COUNT(*) AS count FROM computers") &&
          call.args[0] === appDeviceId,
      ),
    ).toBe(true);
  });

  test("stores the app device id on successful registration", async () => {
    const appDeviceId = "b".repeat(64);
    const harness = computerRegisterEnv();
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          register_token: "one-time-token",
          display_name: "Laptop",
          device: { app_device_id: appDeviceId },
        }),
      }),
      harness.env as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    const insertCall = harness.calls.find((call) =>
      call.sql.includes("INSERT INTO computers"),
    );
    expect(insertCall?.sql).toContain("app_device_id");
    expect(insertCall?.args.at(-1)).toBe(appDeviceId);
  });
});
