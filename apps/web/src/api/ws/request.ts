"use client";

import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { WsAction } from "@/features/connection/hooks/use-websocket";
import {
  getComputerQueryScope,
  type ComputerQueryScope,
} from "@/api/query/query-scope";

export function isComputerQueryScopeCurrent(
  expectedScope: ComputerQueryScope,
): boolean {
  return areComputerQueryScopesEqual(getComputerQueryScope(), expectedScope);
}

export function areComputerQueryScopesEqual(
  currentScope: ComputerQueryScope,
  expectedScope: ComputerQueryScope,
): boolean {
  return (
    currentScope.activeInstanceId === expectedScope.activeInstanceId &&
    currentScope.connectionEpoch === expectedScope.connectionEpoch &&
    currentScope.relaySessionRevision === expectedScope.relaySessionRevision
  );
}

async function waitUntilConnected(): Promise<void> {
  const { waitForWebSocketConnection } = await import(
    "@/features/connection/hooks/use-websocket"
  );
  await waitForWebSocketConnection();
}

/**
 * Shared helper for request/response actions over the app WebSocket.
 */
export async function wsRequest<T>(
  action: WsAction,
  data: unknown = {},
  timeoutMs?: number,
): Promise<T> {
  if (useWebSocketStore.getState().connectionState !== "connected") {
    await waitUntilConnected();
  }
  return useWebSocketStore.getState().send<T>(action, data, timeoutMs);
}

/**
 * Sends only if the active Computer still matches the scope that initiated
 * the request. This prevents queued writes from crossing a reconnect target.
 */
export async function wsRequestForComputerScope<T>(
  expectedScope: ComputerQueryScope,
  action: WsAction,
  data: unknown = {},
  timeoutMs?: number,
): Promise<T> {
  if (!isComputerQueryScopeCurrent(expectedScope)) {
    throw new Error("Computer scope changed before WebSocket request");
  }
  if (useWebSocketStore.getState().connectionState !== "connected") {
    await waitUntilConnected();
  }
  if (!isComputerQueryScopeCurrent(expectedScope)) {
    throw new Error("Computer scope changed while waiting for WebSocket");
  }
  return useWebSocketStore.getState().send<T>(action, data, timeoutMs);
}
