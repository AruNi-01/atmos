import { describe, expect, test } from "bun:test";
import {
  buildClientSessionUrls,
  clientWsUrlFromGateway,
} from "./session-urls";
import { activeComputers, onlineComputers } from "./computers";
import type { ComputerRow } from "./types";

describe("session URL helpers", () => {
  test("buildClientSessionUrls matches gateway + ws paths", () => {
    const urls = buildClientSessionUrls({
      relayOrigin: "https://relay.example/",
      serverId: "srv-1",
      clientToken: "tok",
      clientKind: "web",
    });
    expect(urls.gatewayUrl).toBe(
      "https://relay.example/v1/computers/srv-1/proxy",
    );
    expect(urls.wsUrl).toContain("wss://relay.example/ws/client?");
    expect(urls.wsUrl).toContain("server_id=srv-1");
    expect(urls.wsUrl).toContain("token=tok");
    expect(urls.wsUrl).toContain("client_type=web");
    expect(urls.terminalWsUrl).toContain("/ws/terminal?");
  });

  test("clientWsUrlFromGateway derives WSS handshake URL", () => {
    const ws = clientWsUrlFromGateway({
      gatewayUrl: "https://relay.example/v1/computers/abc/proxy",
      serverId: "abc",
      clientToken: "ct",
      clientKind: "desktop",
    });
    expect(ws).toBe(
      "wss://relay.example/ws/client?server_id=abc&token=ct&client_type=desktop",
    );
  });
});

describe("computer filters", () => {
  const rows: ComputerRow[] = [
    {
      server_id: "a",
      display_name: "A",
      revoked: 0,
      created_at: 1,
      last_seen_at: 2,
      registration_meta: null,
      online: true,
    },
    {
      server_id: "b",
      display_name: "B",
      revoked: 1,
      created_at: 1,
      last_seen_at: null,
      registration_meta: null,
      online: false,
    },
    {
      server_id: "c",
      display_name: "C",
      revoked: 0,
      created_at: 1,
      last_seen_at: null,
      registration_meta: null,
      online: false,
    },
  ];

  test("activeComputers drops revoked", () => {
    expect(activeComputers(rows).map((r) => r.server_id)).toEqual(["a", "c"]);
  });

  test("onlineComputers requires online + not revoked", () => {
    expect(onlineComputers(rows).map((r) => r.server_id)).toEqual(["a"]);
  });
});
