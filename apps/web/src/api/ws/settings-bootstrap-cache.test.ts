// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import {
  settingsBootstrapCache,
  settingsBootstrapQueryFn,
  type SettingsBootstrapPayload,
} from "@/api/ws/settings-bootstrap-cache";
import {
  __resetAtmosWebQueryClientForTests,
  getAtmosWebQueryClient,
} from "@/providers/app/query-client";

let previousWindow: PropertyDescriptor | undefined;

function bootstrapPayload(groupingMode: string): SettingsBootstrapPayload {
  return {
    function_settings: {
      workspace_sidebar: { grouping_mode: groupingMode },
    },
    llm_providers: {},
    code_agent_custom: {},
    agent_behaviour_settings: {},
  } as unknown as SettingsBootstrapPayload;
}

beforeEach(() => {
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new Window({ url: "http://localhost:3030" }),
    writable: true,
  });
  __resetAtmosWebQueryClientForTests();
});

afterEach(() => {
  __resetAtmosWebQueryClientForTests();
  if (previousWindow) {
    Object.defineProperty(globalThis, "window", previousWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("settings bootstrap mutation isolation", () => {
  it("does not suppress an in-flight scope when another scope mutates", async () => {
    const scopeA: ComputerQueryScope = {
      activeInstanceId: "computer:settings-a",
      connectionEpoch: 10,
      relaySessionRevision: 1,
    };
    const scopeB: ComputerQueryScope = {
      activeInstanceId: "computer:settings-b",
      connectionEpoch: 11,
      relaySessionRevision: 2,
    };
    const client = getAtmosWebQueryClient();
    client.setQueryData(
      queryKeys.computer.settingsBootstrap(scopeA),
      bootstrapPayload("project"),
    );

    let resolveBootstrap!: (payload: SettingsBootstrapPayload) => void;
    const deferredBootstrap = new Promise<SettingsBootstrapPayload>((resolve) => {
      resolveBootstrap = resolve;
    });
    const inFlight = settingsBootstrapQueryFn(
      scopeA,
      () => deferredBootstrap,
    );

    settingsBootstrapCache.patchFunctionSetting(
      "workspace_sidebar",
      "grouping_mode",
      "priority",
      scopeB,
    );
    resolveBootstrap(bootstrapPayload("label"));

    const result = await inFlight;
    expect(result.function_settings.workspace_sidebar?.grouping_mode).toBe(
      "label",
    );
  });

  it("preserves a newer mutation made in the same scope", async () => {
    const scope: ComputerQueryScope = {
      activeInstanceId: "computer:settings-same-scope",
      connectionEpoch: 12,
      relaySessionRevision: 3,
    };
    const client = getAtmosWebQueryClient();
    client.setQueryData(
      queryKeys.computer.settingsBootstrap(scope),
      bootstrapPayload("project"),
    );

    let resolveBootstrap!: (payload: SettingsBootstrapPayload) => void;
    const deferredBootstrap = new Promise<SettingsBootstrapPayload>((resolve) => {
      resolveBootstrap = resolve;
    });
    const inFlight = settingsBootstrapQueryFn(
      scope,
      () => deferredBootstrap,
    );

    settingsBootstrapCache.patchFunctionSetting(
      "workspace_sidebar",
      "grouping_mode",
      "priority",
      scope,
    );
    resolveBootstrap(bootstrapPayload("project"));

    const result = await inFlight;
    expect(result.function_settings.workspace_sidebar?.grouping_mode).toBe(
      "priority",
    );
  });
});
