import type {
  ByteStreamListener,
  ByteStreamMessage,
  ByteStreamPort,
  StreamHandle,
  StreamOpenMeta,
  StreamReadyState,
} from "./byte-stream-port";

type MemoryStream = {
  state: StreamReadyState;
  listeners: Set<ByteStreamListener>;
  sent: ByteStreamMessage[];
};

function notifyOpen(stream: MemoryStream): void {
  for (const listener of stream.listeners) {
    listener.onOpen?.();
  }
}

function notifyMessage(stream: MemoryStream, data: ByteStreamMessage): void {
  for (const listener of stream.listeners) {
    listener.onMessage?.(data);
  }
}

function notifyClose(stream: MemoryStream): void {
  for (const listener of stream.listeners) {
    listener.onClose?.();
  }
}

function notifyError(stream: MemoryStream, error: string): void {
  for (const listener of stream.listeners) {
    listener.onError?.(error);
  }
}

/**
 * In-memory {@link ByteStreamPort} for feature tests. Pair with
 * {@link MemoryByteStreamController} to inject server frames.
 */
export type MemoryByteStreamController = {
  port: ByteStreamPort;
  push(data: ByteStreamMessage): void;
  takeSent(): ByteStreamMessage[];
  openNow(): void;
  fail(error: string): void;
  closeRemote(): void;
};

export function createMemoryByteStreamPort(): MemoryByteStreamController {
  let stream: MemoryStream | null = null;

  const port: ByteStreamPort = {
    carrier: "memory",
    async open(_meta: StreamOpenMeta): Promise<StreamHandle> {
      const current: MemoryStream = {
        state: "connecting",
        listeners: new Set(),
        sent: [],
      };
      stream = current;

      const handle: StreamHandle = {
        carrier: "memory",
        readyState: () => current.state,
        send(data) {
          if (current.state !== "open") return;
          current.sent.push(data);
        },
        close() {
          if (current.state === "closed") return;
          current.state = "closed";
          notifyClose(current);
        },
        subscribe(listener) {
          current.listeners.add(listener);
          if (current.state === "open") listener.onOpen?.();
          if (current.state === "closed") listener.onClose?.();
          return () => {
            current.listeners.delete(listener);
          };
        },
      };
      return handle;
    },
  };

  return {
    port,
    push(data) {
      if (!stream || stream.state !== "open") return;
      notifyMessage(stream, data);
    },
    takeSent() {
      if (!stream) return [];
      const sent = stream.sent;
      stream.sent = [];
      return sent;
    },
    openNow() {
      if (!stream || stream.state !== "connecting") return;
      stream.state = "open";
      notifyOpen(stream);
    },
    fail(error) {
      if (!stream || stream.state === "closed") return;
      notifyError(stream, error);
      stream.state = "closed";
      notifyClose(stream);
    },
    closeRemote() {
      if (!stream || stream.state === "closed") return;
      stream.state = "closed";
      notifyClose(stream);
    },
  };
}
