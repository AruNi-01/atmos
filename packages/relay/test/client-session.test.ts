import { describe, expect, test } from "bun:test";
import { buildClientSessionUrls } from "../src/client-session";

describe("client session URLs", () => {
  test("returns app and terminal websocket URLs for mobile clients", () => {
    const urls = buildClientSessionUrls({
      clientKind: "mobile",
      clientToken: "token/with+chars",
      relayOrigin: "https://relay.atmos.land",
      serverId: "server id/with spaces",
    });

    expect(urls).toEqual({
      gatewayUrl: "https://relay.atmos.land/v1/computers/server%20id%2Fwith%20spaces/proxy",
      terminalWsUrl:
        "wss://relay.atmos.land/ws/terminal?server_id=server%20id%2Fwith%20spaces&token=token%2Fwith%2Bchars&client_type=mobile",
      wsUrl:
        "wss://relay.atmos.land/ws/client?server_id=server%20id%2Fwith%20spaces&token=token%2Fwith%2Bchars&client_type=mobile",
    });
  });

  test("uses ws on non-tls local relay origins", () => {
    const urls = buildClientSessionUrls({
      clientKind: "desktop",
      clientToken: "client-token",
      relayOrigin: "http://127.0.0.1:8787",
      serverId: "server",
    });

    expect(urls.wsUrl).toBe(
      "ws://127.0.0.1:8787/ws/client?server_id=server&token=client-token&client_type=desktop",
    );
    expect(urls.terminalWsUrl).toBe(
      "ws://127.0.0.1:8787/ws/terminal?server_id=server&token=client-token&client_type=desktop",
    );
  });
});
