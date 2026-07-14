// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { queryKeys } from "@/api/query/query-keys";
import { getComputerQueryScope, getRelayQueryScope } from "@/api/query/query-scope";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import {
  applyIdentityBearingComputerSettings,
  applyRelaySessionTransport,
  clearQueryStateForLogout,
  peekQueryScopes,
  resetRelaySessionForQuery,
} from "@/features/connection/lib/query-identity-lifecycle";
import {
  __resetAtmosWebQueryClientForTests,
  createAtmosWebQueryClient,
  getAtmosWebQueryClient,
} from "@/providers/app/query-client";

let previousWindow: PropertyDescriptor | undefined;

beforeEach(() => {
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new Window({ url: "http://localhost:3030" }),
    writable: true,
  });
  __resetAtmosWebQueryClientForTests();
  // Ensure singleton exists for lifecycle helpers.
  getAtmosWebQueryClient();

  useAtmosComputerStore.setState({
    relayUrl: "https://relay.atmos.land",
    relaySecretKey: "",
    accessToken: "",
    accessTokenConfigured: false,
    relayWebSocketUrl: null,
    relayGatewayHttpBase: null,
    relayClientToken: null,
    relayAuthRevision: 0,
    relaySessionRevision: 0,
  });
});

afterEach(() => {
  __resetAtmosWebQueryClientForTests();
  if (previousWindow) {
    Object.defineProperty(globalThis, "window", previousWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("query-identity-lifecycle scope bumps", () => {
  test("identity-bearing settings bump auth revision and clear relay/computer caches", async () => {
    const client = getAtmosWebQueryClient();
    const computerScope = getComputerQueryScope();
    const relayScope = getRelayQueryScope();
    client.setQueryData(queryKeys.computer.system(computerScope), { ok: true });
    client.setQueryData(queryKeys.relay.root(relayScope), { ok: true });

    const beforeAuth = useAtmosComputerStore.getState().relayAuthRevision;
    await applyIdentityBearingComputerSettings({ accessToken: "tok-1" });

    expect(useAtmosComputerStore.getState().relayAuthRevision).toBe(beforeAuth + 1);
    expect(useAtmosComputerStore.getState().accessToken).toBe("tok-1");
    expect(client.getQueryData(queryKeys.computer.system(computerScope))).toBeUndefined();
    expect(client.getQueryData(queryKeys.relay.root(relayScope))).toBeUndefined();
    expect(peekQueryScopes().relay.authRevision).toBe(beforeAuth + 1);
  });

  test("non-identity noop does not bump auth revision", async () => {
    useAtmosComputerStore.getState().setAccessToken("same");
    const before = useAtmosComputerStore.getState().relayAuthRevision;
    await applyIdentityBearingComputerSettings({ accessToken: "same" });
    expect(useAtmosComputerStore.getState().relayAuthRevision).toBe(before);
  });

  test("relay session transport bumps session revision and clears computer queries", async () => {
    const client = getAtmosWebQueryClient();
    const before = useAtmosComputerStore.getState().relaySessionRevision;
    const computerScope = getComputerQueryScope();
    client.setQueryData(queryKeys.computer.tmuxStatus(computerScope), { installed: true });

    await applyRelaySessionTransport({
      relayWebSocketUrl: "wss://relay.example/ws",
      relayGatewayHttpBase: "https://relay.example/gw",
      relayClientToken: "client-tok",
    });

    expect(useAtmosComputerStore.getState().relaySessionRevision).toBe(before + 1);
    expect(useAtmosComputerStore.getState().relayClientToken).toBe("client-tok");
    expect(client.getQueryData(queryKeys.computer.tmuxStatus(computerScope))).toBeUndefined();
    expect(getComputerQueryScope().relaySessionRevision).toBe(before + 1);
  });

  test("identical relay session transport is a no-op", async () => {
    await applyRelaySessionTransport({
      relayWebSocketUrl: "wss://relay.example/ws",
      relayGatewayHttpBase: "https://relay.example/gw",
      relayClientToken: "client-tok",
    });
    const revision = useAtmosComputerStore.getState().relaySessionRevision;

    await applyRelaySessionTransport({
      relayWebSocketUrl: "wss://relay.example/ws",
      relayGatewayHttpBase: "https://relay.example/gw",
      relayClientToken: "client-tok",
    });

    expect(useAtmosComputerStore.getState().relaySessionRevision).toBe(revision);
  });

  test("logout and relay session reset clear computer query roots", async () => {
    const client = getAtmosWebQueryClient();
    // Isolate factory usage remains available for non-singleton tests.
    expect(createAtmosWebQueryClient()).not.toBe(client);

    await applyRelaySessionTransport({
      relayWebSocketUrl: "wss://relay.example/ws",
      relayGatewayHttpBase: "https://relay.example/gw",
      relayClientToken: "client-tok",
    });
    const computerScope = getComputerQueryScope();
    client.setQueryData(queryKeys.computer.system(computerScope), { ok: true });

    await clearQueryStateForLogout();
    expect(client.getQueryData(queryKeys.computer.system(computerScope))).toBeUndefined();

    await applyRelaySessionTransport({
      relayWebSocketUrl: "wss://relay.example/ws",
      relayGatewayHttpBase: "https://relay.example/gw",
      relayClientToken: "client-tok-2",
    });
    const nextScope = getComputerQueryScope();
    client.setQueryData(queryKeys.computer.system(nextScope), { ok: true });
    await resetRelaySessionForQuery();
    expect(client.getQueryData(queryKeys.computer.system(nextScope))).toBeUndefined();
    expect(useAtmosComputerStore.getState().relayClientToken).toBeNull();
  });
});
