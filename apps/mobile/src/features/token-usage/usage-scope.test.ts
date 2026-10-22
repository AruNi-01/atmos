// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  ALL_COMPUTERS_VALUE,
  type UniqueComputer,
} from "@/features/token-usage/lib/unique-computers";
import {
  missedComputerWarning,
  refreshFailureApplies,
  resolveUsageScope,
  showUsageConnectNotice,
  tokenUsageDisplayedError,
  tokenUsageScopeErrorMessage,
} from "@/features/token-usage/lib/usage-scope";

const current: UniqueComputer = {
  isCurrent: true,
  key: "app:aa",
  label: "Studio",
  serverId: "studio",
};
const other: UniqueComputer = {
  isCurrent: false,
  key: "app:bb",
  label: "Travel",
  serverId: "travel",
};

describe("resolveUsageScope", () => {
  test("defaults to the connected computer", () => {
    const scope = resolveUsageScope({
      devices: [other, current],
      selection: null,
      showSelect: true,
    });
    expect(scope.selectedKey).toBe(current.key);
    expect(scope.isAll).toBe(false);
    expect(scope.isCurrentScope).toBe(true);
  });

  test("selects every computer when the menu picks All", () => {
    const scope = resolveUsageScope({
      devices: [current, other],
      selection: ALL_COMPUTERS_VALUE,
      showSelect: true,
    });
    expect(scope.isAll).toBe(true);
    expect(scope.isCurrentScope).toBe(false);
    expect(scope.scopedUsageKey).toBe(`${ALL_COMPUTERS_VALUE}:app:aa,app:bb`);
  });

  test("drops an unknown selection back to the current computer", () => {
    const scope = resolveUsageScope({
      devices: [current, other],
      selection: "server:missing",
      showSelect: true,
    });
    expect(scope.selectedKey).toBe(current.key);
    expect(scope.isCurrentScope).toBe(true);
  });

  test("stays on the connected computer when it is missing from the list", () => {
    const scope = resolveUsageScope({
      devices: [
        { ...other, isCurrent: false },
        { ...current, isCurrent: false },
      ],
      selection: null,
      showSelect: true,
    });
    expect(scope.isAll).toBe(false);
    expect(scope.isCurrentScope).toBe(true);
    expect(scope.selectedKey).toBeNull();
    expect(scope.selectedDevice).toBeNull();
  });

  test("still honors All after the connected computer is missing", () => {
    const scope = resolveUsageScope({
      devices: [
        { ...other, isCurrent: false },
        { ...current, isCurrent: false },
      ],
      selection: ALL_COMPUTERS_VALUE,
      showSelect: true,
    });
    expect(scope.isAll).toBe(true);
    expect(scope.isCurrentScope).toBe(false);
  });

  test("hides the menu by treating the page as the connected computer", () => {
    const scope = resolveUsageScope({
      devices: [current],
      selection: ALL_COMPUTERS_VALUE,
      showSelect: false,
    });
    expect(scope.isAll).toBe(false);
    expect(scope.isCurrentScope).toBe(true);
    expect(scope.showSelect).toBe(false);
  });
});

describe("tokenUsageScopeErrorMessage", () => {
  test("keeps the connected computer's own error", () => {
    expect(
      tokenUsageScopeErrorMessage(new Error("socket closed"), {
        isAll: false,
        isCurrentScope: true,
      }),
    ).toBe("socket closed");
  });

  test("uses a fixed message for another computer or a total miss", () => {
    expect(
      tokenUsageScopeErrorMessage(new Error("offline"), {
        isAll: false,
        isCurrentScope: false,
      }),
    ).toBe("Could not load that Computer.");
    expect(
      tokenUsageScopeErrorMessage(new Error("none-reached"), {
        isAll: true,
        isCurrentScope: false,
      }),
    ).toBe("Could not reach any Computer.");
    expect(missedComputerWarning("Travel")).toBe("Could not reach Travel");
  });
});

describe("showUsageConnectNotice", () => {
  test("shows only while the current computer is disconnected", () => {
    expect(showUsageConnectNotice(true, false)).toBe(true);
    expect(showUsageConnectNotice(true, true)).toBe(false);
    expect(showUsageConnectNotice(false, false)).toBe(false);
  });
});

describe("tokenUsageDisplayedError", () => {
  const current = {
    currentRelayAuthRevision: 2,
    currentRelayUrl: "https://relay.example",
    currentScopeKey: "app:aa",
    currentWsUrl: "wss://computer.example/ws",
    isCurrentScope: true,
  };

  test("shows a refresh failure for the same connection", () => {
    expect(
      refreshFailureApplies({
        ...current,
        refresh: {
          isCurrentScope: true,
          relayAuthRevision: 2,
          relayUrl: "https://relay.example",
          scopeKey: "app:aa",
          wsUrl: "wss://computer.example/ws",
        },
      }),
    ).toBe(true);
    expect(
      tokenUsageDisplayedError({
        queryError: null,
        refreshApplies: true,
        refreshError: new Error("refresh failed"),
        scope: { isAll: false, isCurrentScope: true },
      }),
    ).toBe("refresh failed");
  });

  test("hides a refresh failure after the relay or scope changes", () => {
    expect(
      refreshFailureApplies({
        ...current,
        refresh: {
          isCurrentScope: true,
          relayAuthRevision: 1,
          relayUrl: "https://relay.example",
          scopeKey: "app:aa",
          wsUrl: "wss://computer.example/ws",
        },
      }),
    ).toBe(false);
    expect(
      refreshFailureApplies({
        ...current,
        isCurrentScope: false,
        currentScopeKey: "all:app:aa",
        refresh: {
          isCurrentScope: false,
          relayAuthRevision: 2,
          relayUrl: "https://relay.example",
          scopeKey: "all:app:bb",
          wsUrl: null,
        },
      }),
    ).toBe(false);
    expect(
      tokenUsageDisplayedError({
        queryError: new Error("socket closed"),
        refreshApplies: false,
        refreshError: new Error("refresh failed"),
        scope: { isAll: false, isCurrentScope: true },
      }),
    ).toBe("socket closed");
  });
});
