import { afterEach, describe, expect, test } from "bun:test";
import { createRelayClient } from "./client";
import { RelayError } from "./errors";
import type { RelayTransport } from "./transport";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createRelayClient", () => {
  test("normalizes base URL and lists computers", async () => {
    globalThis.fetch = (async (input) => {
      expect(String(input)).toBe("https://relay.example/v1/computers");
      return new Response(JSON.stringify({ computers: [] }), { status: 200 });
    }) as typeof fetch;

    const client = createRelayClient({ baseUrl: "https://relay.example/" });
    expect(client.baseUrl).toBe("https://relay.example");
    await expect(client.listComputers("device-credential-32chars-minimum!!")).resolves.toEqual(
      [],
    );
  });

  test("sends relay secret header when configured", async () => {
    let headers: HeadersInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      headers = init?.headers;
      return new Response(JSON.stringify({ computers: [] }), { status: 200 });
    }) as typeof fetch;

    const longTok = "t".repeat(32);
    const client = createRelayClient({
      baseUrl: "https://relay.example",
      relaySecretKey: "  relay-secret  ",
    });
    await client.listComputers(longTok);

    const h = new Headers(headers);
    expect(h.get("Authorization")).toBe(`Bearer ${longTok}`);
    expect(h.get("X-Atmos-Relay-Secret")).toBe("relay-secret");
  });

  test("createClientSession requires explicit clientKind and parses terminal URL", async () => {
    let body: unknown;
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          client_token: "client-token",
          expires_at: 1_900_000_000,
          gateway_url: "https://relay.example/v1/computers/server/proxy",
          terminal_ws_url: "wss://relay.example/ws/terminal",
          ws_url: "wss://relay.example/ws/client",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const longTok = "m".repeat(32);
    const client = createRelayClient({ baseUrl: "https://relay.example" });
    const session = await client.createClientSession(longTok, "server", {
      clientKind: "mobile",
    });

    expect(body).toEqual({ client_kind: "mobile" });
    expect(session.terminal_ws_url).toBe("wss://relay.example/ws/terminal");
  });

  test("derives terminal_ws_url from ws_url when omitted", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          client_token: "client-token",
          expires_at: 1_900_000_000,
          gateway_url: "https://relay.example/v1/computers/server/proxy",
          ws_url:
            "wss://relay.example/ws/client?server_id=server&token=client-token",
        }),
        { status: 200 },
      )) as typeof fetch;

    const longTok = "w".repeat(32);
    const client = createRelayClient({ baseUrl: "https://relay.example" });
    const session = await client.createClientSession(longTok, "server", {
      clientKind: "web",
    });
    expect(session.terminal_ws_url).toBe(
      "wss://relay.example/ws/terminal?server_id=server&token=client-token",
    );
  });

  test("rejects invalid client session payloads", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          client_token: "client-token",
          expires_at: 1_900_000_000,
          gateway_url: "https://relay.example/v1/computers/server/proxy",
          ws_url: "wss://relay.example/ws/not-client",
        }),
        { status: 200 },
      )) as typeof fetch;

    const longTok = "x".repeat(32);
    const client = createRelayClient({ baseUrl: "https://relay.example" });
    await expect(
      client.createClientSession(longTok, "server", { clientKind: "desktop" }),
    ).rejects.toMatchObject({
      code: "invalid_client_session_response",
      status: 502,
    } satisfies Partial<RelayError>);
  });

  test("maps HTTP error body to RelayError", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "unauthorized", message: "nope" }), {
        status: 401,
      })) as typeof fetch;

    const longTok = "y".repeat(32);
    const client = createRelayClient({ baseUrl: "https://relay.example" });
    await expect(client.listComputers(longTok)).rejects.toMatchObject({
      name: "RelayError",
      status: 401,
      code: "unauthorized",
      message: "nope",
    });
  });

  test("supports custom transport (e.g. loopback proxy)", async () => {
    const longTok = "d".repeat(32);
    const transport: RelayTransport = async (req) => {
      expect(req.path).toBe("/v1/register_tokens");
      expect(req.method).toBe("POST");
      expect(req.headers.Authorization).toBe(`Bearer ${longTok}`);
      return {
        status: 200,
        json: {
          register_token: "rt",
          expires_at: 99,
          register_command: "atmos computer start --token rt",
        },
      };
    };

    const client = createRelayClient({
      baseUrl: "https://relay.example",
      transport,
    });
    const token = await client.createRegisterToken(longTok);
    expect(token.register_token).toBe("rt");
  });

  test("rejects short device credentials before fetch", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const client = createRelayClient({ baseUrl: "https://relay.example" });
    await expect(client.listComputers("short")).rejects.toMatchObject({
      code: "invalid_device_credential",
      status: 401,
    });
    expect(called).toBe(false);
  });

  test("withDeviceCredential binds token for subsequent calls", async () => {
    const longTok = "e".repeat(32);
    globalThis.fetch = (async (_input, init) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${longTok}`,
      );
      return new Response(JSON.stringify({ computers: [] }), { status: 200 });
    }) as typeof fetch;

    const auth = createRelayClient({
      baseUrl: "https://relay.example",
    }).withDeviceCredential(longTok);
    await expect(auth.listComputers()).resolves.toEqual([]);
  });
});
