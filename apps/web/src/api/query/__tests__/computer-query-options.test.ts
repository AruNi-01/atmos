import { describe, expect, test } from "bun:test";
import {
  restComputerQueryEnabled,
  restComputerQueryOptions,
  wsComputerQueryEnabled,
  wsQueryOptions,
} from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

describe("computer-query-options enablement", () => {
  test("wsComputerQueryEnabled requires connected WebSocket and scope", () => {
    expect(wsComputerQueryEnabled(scope, "connected")).toBe(true);
    expect(wsComputerQueryEnabled(scope, "connecting")).toBe(false);
    expect(wsComputerQueryEnabled(scope, "disconnected")).toBe(false);
    expect(wsComputerQueryEnabled(scope, "reconnecting")).toBe(false);
    expect(wsComputerQueryEnabled(null, "connected")).toBe(false);
    expect(
      wsComputerQueryEnabled(
        { ...scope, activeInstanceId: "" as ComputerQueryScope["activeInstanceId"] },
        "connected",
      ),
    ).toBe(false);
  });

  test("restComputerQueryEnabled requires runtimeReady and scope", () => {
    expect(restComputerQueryEnabled(scope, true)).toBe(true);
    expect(restComputerQueryEnabled(scope, false)).toBe(false);
    expect(restComputerQueryEnabled(null, true)).toBe(false);
  });

  test("wsQueryOptions combines connection enablement with caller enabled", () => {
    const connected = wsQueryOptions({
      scope,
      connectionState: "connected",
      queryKey: ["k"],
      queryFn: async () => 1,
    });
    expect(connected.enabled).toBe(true);

    const disconnected = wsQueryOptions({
      scope,
      connectionState: "disconnected",
      queryKey: ["k"],
      queryFn: async () => 1,
      enabled: true,
    });
    expect(disconnected.enabled).toBe(false);

    const callerDisabled = wsQueryOptions({
      scope,
      connectionState: "connected",
      queryKey: ["k"],
      queryFn: async () => 1,
      enabled: false,
    });
    expect(callerDisabled.enabled).toBe(false);
  });

  test("wsQueryOptions preserves caller refetchInterval", () => {
    const opts = wsQueryOptions({
      scope,
      connectionState: "connected",
      queryKey: ["k"],
      queryFn: async () => 1,
      refetchInterval: 15_000,
    });
    expect(opts.refetchInterval).toBe(15_000);

    const interactive = wsQueryOptions({
      scope,
      connectionState: "connected",
      queryKey: ["k"],
      queryFn: async () => 1,
      refetchInterval: false,
    });
    expect(interactive.refetchInterval).toBe(false);
  });

  test("wsQueryOptions retry stays off while disconnected", () => {
    const opts = wsQueryOptions({
      scope,
      connectionState: "reconnecting",
      queryKey: ["k"],
      queryFn: async () => 1,
    });
    const retry = opts.retry;
    expect(typeof retry).toBe("function");
    if (typeof retry === "function") {
      expect(retry(0, new Error("fail"))).toBe(false);
    }
  });

  test("restComputerQueryOptions combines runtimeReady with caller enabled", () => {
    expect(
      restComputerQueryOptions({
        scope,
        runtimeReady: true,
        queryKey: ["k"],
        queryFn: async () => 1,
      }).enabled,
    ).toBe(true);

    expect(
      restComputerQueryOptions({
        scope,
        runtimeReady: false,
        queryKey: ["k"],
        queryFn: async () => 1,
        enabled: true,
      }).enabled,
    ).toBe(false);

    expect(
      restComputerQueryOptions({
        scope,
        runtimeReady: true,
        queryKey: ["k"],
        queryFn: async () => 1,
        enabled: false,
      }).enabled,
    ).toBe(false);
  });
});
