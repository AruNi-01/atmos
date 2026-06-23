// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { setHostedRuntimeApiOverride } from "../desktop-runtime";
import { buildWsUrl, buildWsUrlSync } from "../ws-url";
import { buildTerminalWsUrl } from "../../../features/terminal/lib/terminal-ws-url";

const HOSTED_URL = "https://app.atmos.land";

let previousWindow: PropertyDescriptor | undefined;
let previousApiPort: string | undefined;
let previousWsUrl: string | undefined;

beforeEach(() => {
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  previousApiPort = process.env.NEXT_PUBLIC_API_PORT;
  previousWsUrl = process.env.NEXT_PUBLIC_WS_URL;
  process.env.NEXT_PUBLIC_API_PORT = "30303";
  Reflect.deleteProperty(process.env, "NEXT_PUBLIC_WS_URL");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new Window({ url: HOSTED_URL }),
    writable: true,
  });
  setHostedRuntimeApiOverride(null);
});

afterEach(() => {
  if (previousWindow) {
    Object.defineProperty(globalThis, "window", previousWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
  if (previousApiPort === undefined) {
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_API_PORT");
  } else {
    process.env.NEXT_PUBLIC_API_PORT = previousApiPort;
  }
  if (previousWsUrl === undefined) {
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_WS_URL");
  } else {
    process.env.NEXT_PUBLIC_WS_URL = previousWsUrl;
  }
  setHostedRuntimeApiOverride(null);
});

describe("hosted loopback WebSocket URLs", () => {
  it("uses ws for the hosted app's synchronous local fallback", () => {
    expect(buildWsUrlSync("/ws", { client_type: "web" })).toBe(
      "ws://127.0.0.1:30303/ws?client_type=web",
    );
  });

  it("uses ws for the hosted app's resolved local runtime config", async () => {
    await expect(buildWsUrl("/ws", { client_type: "web" })).resolves.toBe(
      "ws://127.0.0.1:30303/ws?client_type=web",
    );
  });

  it("uses ws for hosted terminal sessions before runtime rewrite", () => {
    expect(
      buildTerminalWsUrl({
        sessionId: "terminal-1",
        workspaceId: "workspace-1",
      }),
    ).toBe(
      "ws://127.0.0.1:30303/ws/terminal/terminal-1?workspace_id=workspace-1",
    );
  });

  it("keeps hosted terminal sessions on loopback even when a WS env override exists", () => {
    process.env.NEXT_PUBLIC_WS_URL = "wss://app.atmos.land";

    expect(
      buildTerminalWsUrl({
        sessionId: "terminal-1",
        workspaceId: "workspace-1",
      }),
    ).toBe(
      "ws://127.0.0.1:30303/ws/terminal/terminal-1?workspace_id=workspace-1",
    );
  });
});
