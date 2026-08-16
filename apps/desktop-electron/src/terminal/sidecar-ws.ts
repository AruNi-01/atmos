import WebSocket from "ws";

import type { SidecarWebSocket } from "./stream-hub.js";

/** Node `ws` client: supports `ws+unix://` which global WebSocket does not. */
export function createNodeSidecarSocket(url: string): SidecarWebSocket {
  const socket = new WebSocket(url, {
    headers: { Host: "127.0.0.1" },
  });
  socket.binaryType = "arraybuffer";
  return socket as unknown as SidecarWebSocket;
}
