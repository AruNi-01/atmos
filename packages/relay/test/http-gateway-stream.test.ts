import { describe, expect, mock, test } from "bun:test";
import { decodeGatewayStream } from "../src/http-stream";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

function gatewayEnv(
  hubFetch: (request: Request) => Promise<Response>,
  options: { e2eePk?: string | null } = {},
) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes("client_sessions")) {
                  return { ok: 1 };
                }
                if (sql.includes("computers")) {
                  return { revoked: 0, e2ee_static_pk: options.e2eePk ?? null };
                }
                return null;
              },
            };
          },
        };
      },
    },
    SERVER_HUB: {
      idFromName: () => "hub",
      get: () => ({ fetch: hubFetch }),
    },
    PT_DESIGN_ROOM: {
      idFromName: () => "room",
      get: () => ({ fetch: async () => new Response(null) }),
    },
  };
}

describe("HTTP gateway worker proxy stream", () => {
  test("forwards prelude plus body through worker.fetch", async () => {
    const { default: worker } = await import("../src/index");
    let captured: Uint8Array | null = null;
    const env = gatewayEnv(async (request) => {
      captured = new Uint8Array(await request.arrayBuffer());
      return new Response("ok", { status: 200 });
    });
    const payload = new Uint8Array(64 * 1024).fill(0x42);
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv-1/proxy/api/system/file", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
          "content-type": "application/octet-stream",
        },
        body: payload,
      }),
      env as never,
      { waitUntil() {} } as never,
    );
    expect(response.status).toBe(200);
    expect(captured).not.toBeNull();
    const decoded = await decodeGatewayStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(captured!);
          controller.close();
        },
      }),
    );
    expect(decoded.meta.method).toBe("PUT");
    expect(decoded.meta.path).toBe("/api/system/file");
    const rest = new Uint8Array(await new Response(decoded.rest).arrayBuffer());
    expect(rest).toEqual(payload);
  });

  test("does not hang when the hub returns without reading the body", async () => {
    const { default: worker } = await import("../src/index");
    const env = gatewayEnv(async () => {
      return new Response(JSON.stringify({ error: "server_offline" }), { status: 503 });
    });
    const payload = new Uint8Array(256 * 1024).fill(1);
    const response = await Promise.race([
      worker.fetch(
        new Request("https://relay.atmos.land/v1/computers/srv-1/proxy/upload", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${"a".repeat(32)}`,
          },
          body: payload,
        }),
        env as never,
        { waitUntil() {} } as never,
      ),
      new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error("proxy hung")), 2000);
      }),
    ]);
    expect(response.status).toBe(503);
  });

  test("copies E2EE prelude and strips hop headers from forwarded metadata", async () => {
    const { default: worker } = await import("../src/index");
    let captured: Uint8Array | null = null;
    const env = gatewayEnv(
      async (request) => {
        captured = new Uint8Array(await request.arrayBuffer());
        return new Response("ok", { status: 200 });
      },
      { e2eePk: "A".repeat(43) },
    );
    const eph = "A".repeat(43);
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv-1/proxy/api/system/runtime-info", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
          "X-Atmos-E2EE": "1",
          "X-Atmos-E2EE-Alg": "x25519-chacha20poly1305",
          "X-Atmos-E2EE-Request-Id": "req-e2ee-1",
          "X-Atmos-E2EE-Eph-Pk": eph,
          "X-Atmos-Api-Token": "local-token",
        },
      }),
      env as never,
      { waitUntil() {} } as never,
    );
    expect(response.status).toBe(200);
    expect(captured).not.toBeNull();
    const decoded = await decodeGatewayStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(captured!);
          controller.close();
        },
      }),
    );
    expect(decoded.meta.e2ee).toEqual({
      v: 1,
      alg: "x25519-chacha20poly1305",
      request_id: "req-e2ee-1",
      eph_pk: eph,
    });
    const forwarded = new Map(
      decoded.meta.headers.map(([key, value]) => [key.toLowerCase(), value]),
    );
    expect(forwarded.has("x-atmos-e2ee")).toBe(false);
    expect(forwarded.has("x-atmos-e2ee-eph-pk")).toBe(false);
    expect(forwarded.has("x-atmos-e2ee-alg")).toBe(false);
    expect(forwarded.has("x-atmos-e2ee-request-id")).toBe(false);
    expect(forwarded.get("x-atmos-api-token")).toBe("local-token");
  });

  test("rejects E2EE when the Computer has not advertised a static key", async () => {
    const { default: worker } = await import("../src/index");
    let hubCalled = false;
    const env = gatewayEnv(async () => {
      hubCalled = true;
      return new Response("should-not-run");
    });
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv-1/proxy/x", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
          "X-Atmos-E2EE": "1",
          "X-Atmos-E2EE-Alg": "x25519-chacha20poly1305",
          "X-Atmos-E2EE-Request-Id": "req-no-pk",
          "X-Atmos-E2EE-Eph-Pk": "A".repeat(43),
        },
      }),
      env as never,
      { waitUntil() {} } as never,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "e2ee_unavailable" });
    expect(hubCalled).toBe(false);
  });

  test("rejects a malformed E2EE offer with 400", async () => {
    const { default: worker } = await import("../src/index");
    let hubCalled = false;
    const env = gatewayEnv(async () => {
      hubCalled = true;
      return new Response("should-not-run");
    });
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv-1/proxy/x", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
          "X-Atmos-E2EE": "1",
          "X-Atmos-E2EE-Alg": "aes-256-gcm",
          "X-Atmos-E2EE-Request-Id": "req-bad",
          "X-Atmos-E2EE-Eph-Pk": "A".repeat(43),
        },
      }),
      env as never,
      { waitUntil() {} } as never,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_e2ee" });
    expect(hubCalled).toBe(false);
  });

  test("rejects a short eph_pk with 400", async () => {
    const { default: worker } = await import("../src/index");
    let hubCalled = false;
    const env = gatewayEnv(async () => {
      hubCalled = true;
      return new Response("should-not-run");
    });
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv-1/proxy/x", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
          "X-Atmos-E2EE": "1",
          "X-Atmos-E2EE-Alg": "x25519-chacha20poly1305",
          "X-Atmos-E2EE-Request-Id": "req-short-eph",
          "X-Atmos-E2EE-Eph-Pk": "short",
        },
      }),
      env as never,
      { waitUntil() {} } as never,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_e2ee" });
    expect(hubCalled).toBe(false);
  });

  test("rejects client WS E2EE when the Computer has no static key", async () => {
    const { default: worker } = await import("../src/index");
    const env = gatewayEnv(async () => new Response("should-not-run"));
    const response = await worker.fetch(
      new Request(
        "https://relay.atmos.land/ws/client?server_id=srv-1&token=client-token&e2ee=1&e2ee_alg=x25519-chacha20poly1305&eph_pk=" +
          "A".repeat(43),
        {
          headers: { Upgrade: "websocket", Connection: "Upgrade" },
        },
      ),
      env as never,
      { waitUntil() {} } as never,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "e2ee_unavailable" });
  });

  test("CORS preflight allows X-Atmos-E2EE hop headers", async () => {
    const { default: worker } = await import("../src/index");
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv-1/proxy/x", {
        method: "OPTIONS",
      }),
      gatewayEnv(async () => new Response("no")) as never,
      { waitUntil() {} } as never,
    );
    expect(response.status).toBe(204);
    const allow = response.headers.get("Access-Control-Allow-Headers") ?? "";
    expect(allow).toContain("X-Atmos-E2EE");
    expect(allow).toContain("X-Atmos-E2EE-Alg");
    expect(allow).toContain("X-Atmos-E2EE-Request-Id");
    expect(allow).toContain("X-Atmos-E2EE-Eph-Pk");
    const expose = response.headers.get("Access-Control-Expose-Headers") ?? "";
    expect(expose).toContain("X-Atmos-E2EE");
    expect(expose).toContain("X-Atmos-E2EE-Alg");
    expect(expose).toContain("X-Atmos-E2EE-Request-Id");
    expect(expose).toContain("X-Atmos-E2EE-Eph-Pk");
  });
});
