import { randomUUID } from "node:crypto";

import {
  rewriteTerminalStreamUrlToLocalApi,
  type LocalApiTarget,
} from "./loopback-url.js";

export type TerminalStreamEvent =
  | { type: "open"; streamId: string }
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

const WS_OPEN = 1;

type LiveStream = {
  id: string;
  senderId: number;
  ws: SidecarWebSocket;
  closed: boolean;
};

export type TerminalStreamHub = {
  open(sink: TerminalStreamSink, requestedUrl: string): Promise<{ streamId: string }>;
  send(senderId: number, streamId: string, data: string | ArrayBuffer): void;
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

export function createTerminalStreamHub(options: {
  getApi: () => LocalApiTarget | null;
  WebSocketImpl?: SidecarWebSocketConstructor;
}): TerminalStreamHub {
  const WebSocketImpl = options.WebSocketImpl ?? defaultWebSocketCtor();
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

  return {
    async open(sink, requestedUrl) {
      const api = options.getApi();
      if (!api) {
        throw new Error("API not ready");
      }
      const url = rewriteTerminalStreamUrlToLocalApi(requestedUrl, api);
      const streamId = randomUUID();
      const ws = new WebSocketImpl(url);
      ws.binaryType = "arraybuffer";
      const stream: LiveStream = {
        id: streamId,
        senderId: sink.id,
        ws,
        closed: false,
      };
      streams.set(streamId, stream);

      ws.onopen = () => {
        if (stream.closed) return;
        sink.send({ type: "open", streamId });
      };
      ws.onmessage = (event) => {
        if (stream.closed) return;
        if (typeof event.data === "string") {
          sink.send({ type: "message", streamId, kind: "text", text: event.data });
          return;
        }
        const bytes = bytesToArrayBuffer(event.data);
        if (bytes && bytes.byteLength > 0) {
          sink.send({ type: "message", streamId, kind: "binary", bytes });
        }
      };
      ws.onerror = () => {
        if (stream.closed) return;
        sink.send({ type: "error", streamId, error: "Terminal connection error" });
      };
      ws.onclose = () => {
        if (stream.closed) return;
        drop(stream);
        sink.send({ type: "close", streamId });
      };

      if (ws.readyState === WS_OPEN) {
        sink.send({ type: "open", streamId });
      }

      return { streamId };
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
