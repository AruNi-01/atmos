import { describe, expect, mock, test } from "bun:test";
import { decodeGatewayStream } from "../src/http-stream";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

function gatewayEnv(hubFetch: (request: Request) => Promise<Response>) {
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
    const env = gatewayEnv(async (request) => {
      captured = new Uint8Array(await request.arrayBuffer());
      return new Response("ok", { status: 200 });
    });
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
    expect(forwarded.get("x-atmos-api-token")).toBe("local-token");
  });

  test("rejects a malformed E2EE offer with 400", async () => {
    const { default: worker } = await import("../src/index");
    const env = gatewayEnv(async () => new Response("should-not-run"));
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv-1/proxy/x", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
          "X-Atmos-E2EE": "1",
          "X-Atmos-E2EE-Alg": "aes-256-gcm",
          "X-Atmos-E2EE-Request-Id": "req-bad",
          "X-Atmos-E2EE-Eph-Pk": "short",
        },
      }),
      env as never,
      { waitUntil() {} } as never,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_e2ee" });
  });
});
