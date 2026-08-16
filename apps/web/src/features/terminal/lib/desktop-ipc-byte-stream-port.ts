import type {
  ByteStreamListener,
  ByteStreamMessage,
  ByteStreamPort,
  StreamHandle,
  StreamOpenMeta,
  StreamReadyState,
} from "@atmos/shared/terminal";
import {
  getDesktopTerminalStreamApi,
  type DesktopListenUnlisten,
  type DesktopTerminalStreamApi,
} from "@/shared/lib/desktop-bridge";

type EventListen = (
  event: string,
  handler: (payload: unknown) => void,
) => DesktopListenUnlisten | void;

type LiveIpcStream = {
  state: StreamReadyState;
  listeners: Set<ByteStreamListener>;
  lastError: string | null;
  backlog: ByteStreamMessage[];
};

const streams = new Map<string, LiveIpcStream>();
const pending = new Map<string, Array<() => void>>();
const retired = new Set<string>();
let busStarted = false;
let busUnsubs: DesktopListenUnlisten[] = [];

function asBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function enqueue(streamId: string, apply: () => void): void {
  const stream = streams.get(streamId);
  if (stream) {
    apply();
    return;
  }
  if (retired.has(streamId)) return;
  const queue = pending.get(streamId) ?? [];
  queue.push(apply);
  pending.set(streamId, queue);
}

function flush(streamId: string): void {
  const queue = pending.get(streamId);
  if (!queue) return;
  pending.delete(streamId);
  for (const apply of queue) apply();
}

function retire(streamId: string): void {
  retired.add(streamId);
  pending.delete(streamId);
  streams.delete(streamId);
}

function notify(stream: LiveIpcStream, fn: (listener: ByteStreamListener) => void): void {
  for (const listener of stream.listeners) fn(listener);
}

function onOpen(streamId: string): void {
  enqueue(streamId, () => {
    const stream = streams.get(streamId);
    if (!stream || stream.state === "closed") return;
    stream.state = "open";
    notify(stream, (listener) => listener.onOpen?.());
  });
}

function onMessage(streamId: string, data: ByteStreamMessage): void {
  enqueue(streamId, () => {
    const stream = streams.get(streamId);
    if (!stream || stream.state === "closed") return;
    if (stream.listeners.size === 0) {
      stream.backlog.push(data);
      if (stream.backlog.length > 256) {
        stream.backlog.shift();
      }
      return;
    }
    notify(stream, (listener) => listener.onMessage?.(data));
  });
}

function onError(streamId: string, error: string): void {
  enqueue(streamId, () => {
    const stream = streams.get(streamId);
    if (!stream || stream.state === "closed") return;
    stream.lastError = error;
    notify(stream, (listener) => listener.onError?.(error));
  });
}

function onClose(streamId: string): void {
  enqueue(streamId, () => {
    const stream = streams.get(streamId);
    if (!stream || stream.state === "closed") return;
    stream.state = "closed";
    notify(stream, (listener) => listener.onClose?.());
    retire(streamId);
  });
}

function payloadStreamId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const streamId = (payload as { streamId?: unknown }).streamId;
  return typeof streamId === "string" && streamId ? streamId : null;
}

function defaultListen(): EventListen {
  return (event, handler) => {
    const win = window as unknown as {
      __ATMOS_DESKTOP__?: { on?: EventListen };
    };
    return win.__ATMOS_DESKTOP__?.on?.(event, handler);
  };
}

async function ensureBus(on: EventListen): Promise<void> {
  if (busStarted) return;
  busStarted = true;
  const subscribe = (event: string, handler: (payload: unknown) => void) => {
    const off = on(event, handler);
    if (typeof off === "function") busUnsubs.push(off);
  };
  subscribe("terminal_stream_open", (payload) => {
    const streamId = payloadStreamId(payload);
    if (streamId) onOpen(streamId);
  });
  subscribe("terminal_stream_message", (payload) => {
    const streamId = payloadStreamId(payload);
    if (!streamId || !payload || typeof payload !== "object") return;
    const message = payload as { kind?: unknown; text?: unknown; bytes?: unknown };
    if (message.kind === "text" && typeof message.text === "string") {
      onMessage(streamId, message.text);
      return;
    }
    const bytes = asBytes(message.bytes);
    if (bytes?.length) onMessage(streamId, bytes);
  });
  subscribe("terminal_stream_error", (payload) => {
    const streamId = payloadStreamId(payload);
    if (!streamId) return;
    const error =
      payload && typeof payload === "object"
        ? (payload as { error?: unknown }).error
        : null;
    onError(
      streamId,
      typeof error === "string" ? error : "Terminal connection error",
    );
  });
  subscribe("terminal_stream_close", (payload) => {
    const streamId = payloadStreamId(payload);
    if (streamId) onClose(streamId);
  });
}

function copyBytes(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export function createDesktopIpcByteStreamPort(
  api: DesktopTerminalStreamApi | null = getDesktopTerminalStreamApi(),
  listen: EventListen = defaultListen(),
): ByteStreamPort {
  if (!api) {
    throw new Error("Desktop terminal IPC bridge is unavailable");
  }

  return {
    carrier: "ipc",
    async open(meta: StreamOpenMeta): Promise<StreamHandle> {
      await ensureBus(listen);
      const { streamId } = await api.open(meta.url);
      const stream: LiveIpcStream = {
        state: "connecting",
        listeners: new Set(),
        lastError: null,
        backlog: [],
      };
      streams.set(streamId, stream);
      flush(streamId);

      const handle: StreamHandle = {
        carrier: "ipc",
        readyState: () => stream.state,
        send(data) {
          if (stream.state !== "open") return;
          if (typeof data === "string") {
            api.send(streamId, data);
            return;
          }
          api.send(streamId, copyBytes(data));
        },
        close() {
          if (stream.state === "closed") return;
          stream.state = "closed";
          notify(stream, (listener) => listener.onClose?.());
          retire(streamId);
          api.close(streamId);
        },
        subscribe(listener) {
          stream.listeners.add(listener);
          if (stream.state === "open") listener.onOpen?.();
          if (stream.lastError && stream.state !== "closed") {
            listener.onError?.(stream.lastError);
          }
          if (stream.backlog.length > 0) {
            const queued = stream.backlog;
            stream.backlog = [];
            for (const data of queued) listener.onMessage?.(data);
          }
          if (stream.state === "closed") listener.onClose?.();
          return () => {
            stream.listeners.delete(listener);
          };
        },
      };
      return handle;
    },
  };
}

/** Test-only: drop global IPC bus state between cases. */
export function __resetDesktopIpcByteStreamBusForTests(): void {
  streams.clear();
  pending.clear();
  retired.clear();
  busStarted = false;
  for (const unsub of busUnsubs) {
    try {
      unsub();
    } catch {
      /* ignore */
    }
  }
  busUnsubs = [];
}
