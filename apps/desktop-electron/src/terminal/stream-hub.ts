import { randomUUID } from "node:crypto";

import { mainLog } from "../main-log.js";
import {
  rewriteTerminalStreamUrlToLocalApi,
  rewriteTerminalStreamUrlToUnixSocket,
  type LocalApiTarget,
} from "./loopback-url.js";

export type TerminalSidecar = "uds" | "ws";

export type TerminalStreamEvent =
  | { type: "open"; streamId: string; sidecar: TerminalSidecar }
  | { type: "message"; streamId: string; kind: "text"; text: string }
  | { type: "message"; streamId: string; kind: "binary"; bytes: ArrayBuffer }
  | { type: "error"; streamId: string; error: string }
  | { type: "close"; streamId: string };

export type TerminalStreamSink = {
  id: number;
  send(event: TerminalStreamEvent): void;
};

export type SidecarWebSocket = {
  binaryType: string;
  readonly readyState: number;
  send(data: string | ArrayBufferLike): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
};

export type SidecarWebSocketConstructor = new (url: string) => SidecarWebSocket;
export type SidecarWebSocketFactory = (url: string) => SidecarWebSocket;

const WS_OPEN = 1;
const CONNECT_TIMEOUT_MS = 1500;

type LiveStream = {
  id: string;
  senderId: number;
  ws: SidecarWebSocket;
  sidecar: TerminalSidecar;
  closed: boolean;
};

export type TerminalStreamHub = {
  open(
    sink: TerminalStreamSink,
    requestedUrl: string,
  ): Promise<{ streamId: string; sidecar: TerminalSidecar }>;
  send(senderId: number, streamId: string, data: string | ArrayBufferLike): void;
  close(senderId: number, streamId: string): void;
  closeAllForSender(senderId: number): void;
  size(): number;
};

function bytesToArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return copy.buffer;
  }
  return null;
}

function defaultWebSocketCtor(): SidecarWebSocketConstructor {
  const ctor = (globalThis as { WebSocket?: SidecarWebSocketConstructor }).WebSocket;
  if (!ctor) {
    throw new Error("WebSocket is not available in the desktop main process");
  }
  return ctor;
}

function waitUntilOpen(ws: SidecarWebSocket, timeoutMs: number): Promise<void> {
  if (ws.readyState === WS_OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error("sidecar connect timeout"));
    }, timeoutMs);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(error);
        return;
      }
      resolve();
    };
    ws.onopen = () => finish();
    ws.onerror = () => finish(new Error("sidecar connect failed"));
    ws.onclose = () => finish(new Error("sidecar closed before open"));
  });
}

export function createTerminalStreamHub(options: {
  getApi: () => LocalApiTarget | null;
  WebSocketImpl?: SidecarWebSocketConstructor;
  connect?: SidecarWebSocketFactory;
}): TerminalStreamHub {
  const WebSocketImpl = options.WebSocketImpl ?? defaultWebSocketCtor();
  const connect =
    options.connect ??
    ((url: string) => new WebSocketImpl(url));
  const streams = new Map<string, LiveStream>();

  const drop = (stream: LiveStream) => {
    if (stream.closed) return;
    stream.closed = true;
    streams.delete(stream.id);
    try {
      stream.ws.close();
    } catch {
      /* already closed */
    }
  };

  const attachLiveHandlers = (stream: LiveStream, sink: TerminalStreamSink) => {
    const ws = stream.ws;
    ws.binaryType = "arraybuffer";
    ws.onmessage = (event) => {
      if (stream.closed) return;
      if (typeof event.data === "string") {
        sink.send({ type: "message", streamId: stream.id, kind: "text", text: event.data });
        return;
      }
      const bytes = bytesToArrayBuffer(event.data);
      if (bytes && bytes.byteLength > 0) {
        sink.send({ type: "message", streamId: stream.id, kind: "binary", bytes });
      }
    };
    ws.onerror = () => {
      if (stream.closed) return;
      sink.send({ type: "error", streamId: stream.id, error: "Terminal connection error" });
    };
    ws.onclose = () => {
      if (stream.closed) return;
      drop(stream);
      sink.send({ type: "close", streamId: stream.id });
    };
  };

  return {
    async open(sink, requestedUrl) {
      const api = options.getApi();
      if (!api) {
        throw new Error("API not ready");
      }
      const tcpUrl = rewriteTerminalStreamUrlToLocalApi(requestedUrl, api);
      const unixPath = api.unixSocket?.trim();
      const unixUrl =
        unixPath && unixPath.startsWith("/")
          ? rewriteTerminalStreamUrlToUnixSocket(requestedUrl, unixPath)
          : null;

      let sidecar: TerminalSidecar = "ws";
      let ws: SidecarWebSocket;
      const startedAt = Date.now();
      if (unixUrl) {
        const unixWs = connect(unixUrl);
        unixWs.binaryType = "arraybuffer";
        try {
          await waitUntilOpen(unixWs, CONNECT_TIMEOUT_MS);
          sidecar = "uds";
          ws = unixWs;
        } catch {
          const unixMs = Date.now() - startedAt;
          mainLog(
            `[terminal-stream] unix sidecar failed after ${unixMs}ms; falling back to loopback ws`,
            "warn",
          );
          const tcpWs = connect(tcpUrl);
          tcpWs.binaryType = "arraybuffer";
          await waitUntilOpen(tcpWs, CONNECT_TIMEOUT_MS);
          sidecar = "ws";
          ws = tcpWs;
        }
      } else {
        ws = connect(tcpUrl);
        ws.binaryType = "arraybuffer";
        await waitUntilOpen(ws, CONNECT_TIMEOUT_MS);
      }
      mainLog(
        `[terminal-stream] sidecar=${sidecar} elapsed_ms=${Date.now() - startedAt} unix=${unixPath ?? "none"}`,
      );

      const streamId = randomUUID();
      const stream: LiveStream = {
        id: streamId,
        senderId: sink.id,
        ws,
        sidecar,
        closed: false,
      };
      streams.set(streamId, stream);
      attachLiveHandlers(stream, sink);
      sink.send({ type: "open", streamId, sidecar });
      return { streamId, sidecar };
    },

    send(senderId, streamId, data) {
      const stream = streams.get(streamId);
      if (!stream || stream.closed || stream.senderId !== senderId) return;
      if (stream.ws.readyState !== WS_OPEN) return;
      stream.ws.send(data);
    },

    close(senderId, streamId) {
      const stream = streams.get(streamId);
      if (!stream || stream.senderId !== senderId) return;
      drop(stream);
    },

    closeAllForSender(senderId) {
      for (const stream of [...streams.values()]) {
        if (stream.senderId === senderId) drop(stream);
      }
    },

    size() {
      return streams.size;
    },
  };
}
