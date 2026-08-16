import type {
  ByteStreamPort,
  ControlHandle,
  PtyByteHandle,
  StreamHandle,
  StreamOpenMeta,
  StreamReadyState,
  TerminalSessionListener,
} from "./byte-stream-port";

export type WebSocketLike = {
  binaryType: string;
  readonly readyState: number;
  send(data: string | ArrayBufferLike): void;
  close(): void;
  addEventListener?(type: string, listener: (event: { data?: unknown }) => void): void;
  removeEventListener?(type: string, listener: (event: { data?: unknown }) => void): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
};

export type WebSocketConstructor = new (url: string) => WebSocketLike;

const WS_CONNECTING = 0;
const WS_OPEN = 1;

function defaultWebSocketCtor(): WebSocketConstructor {
  const ctor = (globalThis as { WebSocket?: WebSocketConstructor }).WebSocket;
  if (!ctor) {
    throw new Error("WebSocket is not available");
  }
  return ctor;
}

export function readBinaryMessage(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function readyStateOf(ws: WebSocketLike): StreamReadyState {
  if (ws.readyState === WS_OPEN) return "open";
  if (ws.readyState === WS_CONNECTING) return "connecting";
  return "closed";
}

function sendOnSocket(ws: WebSocketLike, data: string | Uint8Array): void {
  if (ws.readyState !== WS_OPEN) return;
  if (typeof data === "string") {
    ws.send(data);
    return;
  }
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  ws.send(copy);
}

export function createWebSocketByteStreamPort(
  WebSocketImpl: WebSocketConstructor = defaultWebSocketCtor(),
): ByteStreamPort {
  return {
    carrier: "ws",
    async open(meta: StreamOpenMeta): Promise<StreamHandle> {
      const ws = new WebSocketImpl(meta.url);
      ws.binaryType = "arraybuffer";

      const listeners = new Set<TerminalSessionListener>();
      let opened = false;
      let closed = false;
      let lastError: string | null = null;

      const emitOpen = () => {
        opened = true;
        for (const listener of listeners) listener.onOpen?.();
      };
      const emitClose = () => {
        closed = true;
        for (const listener of listeners) listener.onClose?.();
      };
      const emitError = (error: string) => {
        lastError = error;
        for (const listener of listeners) listener.onError?.(error);
      };

      ws.onopen = () => {
        emitOpen();
      };
      ws.onclose = () => {
        emitClose();
      };
      ws.onerror = () => {
        if (closed) return;
        emitError("Terminal connection error");
      };
      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          for (const listener of listeners) listener.onControl?.(event.data);
          return;
        }
        const bytes = readBinaryMessage(event.data);
        if (bytes?.length) {
          for (const listener of listeners) listener.onBytes?.(bytes);
        }
      };

      const control: ControlHandle = {
        send(json) {
          sendOnSocket(ws, json);
        },
      };
      const bytes: PtyByteHandle = {
        send(data) {
          sendOnSocket(ws, data);
        },
      };

      const handle: StreamHandle = {
        carrier: "ws",
        readyState: () => readyStateOf(ws),
        control,
        bytes,
        close() {
          if (closed) return;
          ws.close();
        },
        subscribe(listener) {
          listeners.add(listener);
          if (opened && !closed) listener.onOpen?.();
          if (lastError && !closed) listener.onError?.(lastError);
          if (closed) listener.onClose?.();
          return () => {
            listeners.delete(listener);
          };
        },
      };
      return handle;
    },
  };
}
