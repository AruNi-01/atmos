import { describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

function envWithRelaySecret() {
  return {
    RELAY_SECRET_KEY: "private-relay-secret",
    DB: {
      prepare() {
        throw new Error("DB should not be touched before relay secret auth");
      },
    },
    SERVER_HUB: {
      idFromName: () => "server_1",
      get: () => ({ fetch: async () => new Response(null) }),
    },
  };
}

describe("relay-wide secret gate", () => {
  test("does not require the relay secret for health checks", async () => {
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/healthz"),
      envWithRelaySecret() as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  test("requires the relay secret before protected relay routes touch D1", async () => {
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
        },
      }),
      envWithRelaySecret() as never,
      {} as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "relay_secret_required" });
  });

  test("rejects an invalid relay secret before protected relay routes touch D1", async () => {
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
          "X-Atmos-Relay-Secret": "wrong",
        },
      }),
      envWithRelaySecret() as never,
      {} as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "invalid_relay_secret" });
  });

  test("requires the relay secret for computer registration too", async () => {
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ register_token: "one-time-token" }),
      }),
      envWithRelaySecret() as never,
      {} as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "relay_secret_required" });
  });
});
