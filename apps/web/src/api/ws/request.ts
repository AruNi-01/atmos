"use client";

import type {
  MappedWsAction,
  WsContract,
} from "@atmos/api-types/ws/contract";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
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
export function wsRequest<A extends MappedWsAction>(
  action: A,
  data?: WsContract[A]["input"],
  timeoutMs?: number,
): Promise<WsContract[A]["output"]>;
export async function wsRequest(
  action: string,
  data: unknown = {},
  timeoutMs?: number,
): Promise<unknown> {
  if (useWebSocketStore.getState().connectionState !== "connected") {
    await waitUntilConnected();
  }
  return useWebSocketStore.getState().send(action as never, data as never, timeoutMs);
}

/**
 * Sends only if the active Computer still matches the scope that initiated
 * the request. This prevents queued writes from crossing a reconnect target.
 */
export function wsRequestForComputerScope<A extends MappedWsAction>(
  expectedScope: ComputerQueryScope,
  action: A,
  data?: WsContract[A]["input"],
  timeoutMs?: number,
): Promise<WsContract[A]["output"]>;
export async function wsRequestForComputerScope(
  expectedScope: ComputerQueryScope,
  action: string,
  data: unknown = {},
  timeoutMs?: number,
): Promise<unknown> {
  if (!isComputerQueryScopeCurrent(expectedScope)) {
    throw new Error("Computer scope changed before WebSocket request");
  }
  if (useWebSocketStore.getState().connectionState !== "connected") {
    await waitUntilConnected();
  }
  if (!isComputerQueryScopeCurrent(expectedScope)) {
    throw new Error("Computer scope changed while waiting for WebSocket");
  }
  return useWebSocketStore.getState().send(action as never, data as never, timeoutMs);
}
