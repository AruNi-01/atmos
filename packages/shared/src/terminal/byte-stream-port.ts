/**
 * Carrier-agnostic duplex ports for terminal I/O.
 *
 * Features talk to {@link ByteStreamPort} / {@link StreamHandle}, not WebSocket
 * or Electron IPC. JSON control and PTY bytes share one connection (WS text vs
 * binary, or IPC kind) but are separate handles so TUI input is never JSON.
 */

export type ByteStreamCarrier = "ws" | "ipc" | "uds" | "memory";

/** Desktop main↔API hop when the renderer carrier is `ipc`. */
export type TerminalSidecar = "uds" | "ws";

export type ControlHandle = {
  send(json: string): void;
};

export type PtyByteHandle = {
  send(data: Uint8Array): void;
};

export type StreamOpenMeta = {
  /** Logical endpoint (today: `/ws/terminal/:id?...`). Carriers may rewrite delivery. */
  url: string;
  sessionId: string;
};

export type TerminalSessionListener = {
  onOpen?: () => void;
  onControl?: (json: string) => void;
  onBytes?: (data: Uint8Array) => void;
  onClose?: () => void;
  onError?: (error: string) => void;
};

export type StreamReadyState = "connecting" | "open" | "closed";

export type StreamHandle = {
  readonly carrier: ByteStreamCarrier;
  readonly sidecar?: TerminalSidecar;
  readyState(): StreamReadyState;
  readonly control: ControlHandle;
  readonly bytes: PtyByteHandle;
  close(): void;
  subscribe(listener: TerminalSessionListener): () => void;
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
 * Choose the renderer byte-stream carrier.
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

export function formatTerminalCarrierLog(
  handle: Pick<StreamHandle, "carrier" | "sidecar">,
): string {
  if (handle.sidecar) {
    return `carrier=${handle.carrier} sidecar=${handle.sidecar}`;
  }
  return `carrier=${handle.carrier}`;
}
