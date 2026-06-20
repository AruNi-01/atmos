// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, test } from "bun:test";
import { RelayClient, RelayError } from "./relay-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("RelayClient", () => {
  test("requests mobile client sessions with terminal websocket URLs", async () => {
    let requestBody: unknown;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
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

    const client = new RelayClient("https://relay.example");
    const session = await client.createClientSession("access-token", "server");

    expect(requestBody).toEqual({ client_kind: "mobile" });
    expect(session.terminal_ws_url).toBe("wss://relay.example/ws/terminal");
  });

  test("sends relay secret headers when configured", async () => {
    let requestHeaders: HeadersInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestHeaders = init?.headers;
      return new Response(JSON.stringify({ computers: [] }), { status: 200 });
    }) as typeof fetch;

    const client = new RelayClient("https://relay.example", " relay-secret ");
    await client.listComputers("access-token");

    const headers = new Headers(requestHeaders);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("X-Atmos-Relay-Secret")).toBe("relay-secret");
  });

  test("derives terminal websocket URLs for relay sessions created before the explicit field shipped", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          client_token: "client-token",
          expires_at: 1_900_000_000,
          gateway_url: "https://relay.example/v1/computers/server/proxy",
          ws_url: "wss://relay.example/ws/client?server_id=server&token=client-token",
        }),
        { status: 200 },
      )) as typeof fetch;

    const client = new RelayClient("https://relay.example");
    const session = await client.createClientSession("access-token", "server");

    expect(session.terminal_ws_url).toBe("wss://relay.example/ws/terminal?server_id=server&token=client-token");
  });

  test("rejects client sessions with invalid websocket URLs", async () => {
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

    const client = new RelayClient("https://relay.example");

    await expect(client.createClientSession("access-token", "server")).rejects.toMatchObject({
      code: "invalid_client_session_response",
      status: 502,
    } satisfies Partial<RelayError>);
  });
});
