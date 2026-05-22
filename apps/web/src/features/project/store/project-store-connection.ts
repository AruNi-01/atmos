import { waitForWebSocketConnection } from '@/features/connection/hooks/use-websocket';

// 等待 WebSocket 连接
export async function waitForConnection(timeoutMs?: number): Promise<void> {
  await waitForWebSocketConnection(timeoutMs);
}
