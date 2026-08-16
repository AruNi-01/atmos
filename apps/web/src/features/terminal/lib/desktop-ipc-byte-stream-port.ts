import type {
  ByteStreamPort,
  ControlHandle,
  PtyByteHandle,
  StreamHandle,
  StreamOpenMeta,
  StreamReadyState,
  TerminalSessionListener,
  TerminalSidecar,
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

type IpcFrame = { kind: "control"; json: string } | { kind: "bytes"; data: Uint8Array };

type LiveIpcStream = {
  state: StreamReadyState;
  sidecar?: TerminalSidecar;
  listeners: Set<TerminalSessionListener>;
  lastError: string | null;
  backlog: IpcFrame[];
};

const streams = new Map<string, LiveIpcStream>();
const pending = new Map<string, Array<() => void>>();
const retired = new Set<string>();
let busStarted = false;
let busUnsubs: DesktopListenUnlisten[] = [];

const BACKLOG_LIMIT = 256;
const RETIRED_LIMIT = 512;
const PENDING_LIMIT = 256;

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
  if (queue.length >= PENDING_LIMIT) return;
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
  if (retired.size > RETIRED_LIMIT) {
    const oldest = retired.values().next().value;
    if (oldest) retired.delete(oldest);
  }
}

function overflowStream(streamId: string, stream: LiveIpcStream): void {
  const error = "Terminal output overflow before subscribe";
  stream.lastError = error;
  stream.backlog = [];
  stream.state = "closed";
  notify(stream, (listener) => listener.onError?.(error));
  notify(stream, (listener) => listener.onClose?.());
  retire(streamId);
}

function notify(stream: LiveIpcStream, fn: (listener: TerminalSessionListener) => void): void {
  for (const listener of stream.listeners) fn(listener);
}

function deliver(streamId: string, stream: LiveIpcStream, frame: IpcFrame): void {
  if (stream.listeners.size === 0) {
    if (stream.backlog.length >= BACKLOG_LIMIT) {
      overflowStream(streamId, stream);
      return;
    }
    stream.backlog.push(frame);
    return;
  }
  if (frame.kind === "control") {
    notify(stream, (listener) => listener.onControl?.(frame.json));
    return;
  }
  notify(stream, (listener) => listener.onBytes?.(frame.data));
}

function onOpen(streamId: string): void {
  enqueue(streamId, () => {
    const stream = streams.get(streamId);
    if (!stream || stream.state === "closed") return;
    stream.state = "open";
    notify(stream, (listener) => listener.onOpen?.());
  });
}

function onFrame(streamId: string, frame: IpcFrame): void {
  enqueue(streamId, () => {
    const stream = streams.get(streamId);
    if (!stream || stream.state === "closed") return;
    deliver(streamId, stream, frame);
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
  if (!streams.has(streamId)) {
    retire(streamId);
    return;
  }
  enqueue(streamId, () => {
    const stream = streams.get(streamId);
    if (!stream || stream.state === "closed") {
      retire(streamId);
      return;
    }
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
      onFrame(streamId, { kind: "control", json: message.text });
      return;
    }
    const bytes = asBytes(message.bytes);
    if (bytes?.length) onFrame(streamId, { kind: "bytes", data: bytes });
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

function readSidecar(value: unknown): TerminalSidecar | undefined {
  return value === "uds" || value === "ws" ? value : undefined;
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
      const opened = await api.open(meta.url);
      const streamId = opened.streamId;
      const sidecar = readSidecar(opened.sidecar);
      const stream: LiveIpcStream = {
        state: "connecting",
        sidecar,
        listeners: new Set(),
        lastError: null,
        backlog: [],
      };
      streams.set(streamId, stream);
      flush(streamId);

      const control: ControlHandle = {
        send(json) {
          if (stream.state !== "open") return;
          api.send(streamId, json);
        },
      };
      const bytes: PtyByteHandle = {
        send(data) {
          if (stream.state !== "open") return;
          api.send(streamId, copyBytes(data));
        },
      };

      const handle: StreamHandle = {
        carrier: "ipc",
        sidecar,
        readyState: () => stream.state,
        control,
        bytes,
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
          if (stream.lastError) listener.onError?.(stream.lastError);
          if (stream.backlog.length > 0) {
            const queued = stream.backlog;
            stream.backlog = [];
            for (const frame of queued) {
              if (frame.kind === "control") listener.onControl?.(frame.json);
              else listener.onBytes?.(frame.data);
            }
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
