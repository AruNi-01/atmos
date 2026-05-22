"use client";

import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { WsAction } from "@/features/connection/hooks/use-websocket";

/**
 * Shared helper for request/response actions over the app WebSocket.
 */
export async function wsRequest<T>(
  action: WsAction,
  data: unknown = {},
  timeoutMs?: number,
): Promise<T> {
  const { send, connectionState } = useWebSocketStore.getState();

  if (connectionState !== "connected") {
    const { waitForWebSocketConnection } = await import("@/features/connection/hooks/use-websocket");
    await waitForWebSocketConnection();
  }

  return send<T>(action, data, timeoutMs);
}
