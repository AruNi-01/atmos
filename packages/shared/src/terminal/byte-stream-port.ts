/**
 * Carrier-agnostic duplex port for terminal I/O.
 *
 * Features talk to {@link ByteStreamPort} / {@link StreamHandle}, not WebSocket
 * or Electron IPC. JSON control frames are UTF-8 strings; PTY output is binary.
 */

export type ByteStreamCarrier = "ws" | "ipc" | "uds" | "memory";

export type ByteStreamMessage = string | Uint8Array;

export type StreamOpenMeta = {
  /** Logical endpoint (today: `/ws/terminal/:id?...`). Carriers may rewrite delivery. */
  url: string;
  sessionId: string;
};

export type ByteStreamListener = {
  onOpen?: () => void;
  onMessage?: (data: ByteStreamMessage) => void;
  onClose?: () => void;
  onError?: (error: string) => void;
};

export type StreamReadyState = "connecting" | "open" | "closed";

export type StreamHandle = {
  readonly carrier: ByteStreamCarrier;
  readyState(): StreamReadyState;
  send(data: ByteStreamMessage): void;
  close(): void;
  subscribe(listener: ByteStreamListener): () => void;
};

export type ByteStreamPort = {
  readonly carrier: ByteStreamCarrier;
  open(meta: StreamOpenMeta): Promise<StreamHandle>;
};

export type TerminalByteStreamBinding = {
  electronShell: boolean;
  hasIpcBridge: boolean;
  url: string;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTS.has(host);
}

/** True when `url` is a ws/wss URL whose host is loopback (not “looks local”). */
export function isLoopbackWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      return false;
    }
    return isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Choose the byte-stream carrier.
 *
 * Desktop local (Electron + IPC bridge + loopback sidecar) → `ipc`.
 * Browser, Tauri, remote/tunnel, or missing IPC → `ws`.
 */
export function resolveTerminalByteStreamCarrier(
  input: TerminalByteStreamBinding,
): ByteStreamCarrier {
  if (
    input.electronShell &&
    input.hasIpcBridge &&
    isLoopbackWebSocketUrl(input.url)
  ) {
    return "ipc";
  }
  return "ws";
}
