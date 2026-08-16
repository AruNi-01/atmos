import type {
  ByteStreamPort,
  ControlHandle,
  PtyByteHandle,
  StreamHandle,
  StreamOpenMeta,
  StreamReadyState,
  TerminalSessionListener,
} from "./byte-stream-port";

type MemoryStream = {
  state: StreamReadyState;
  listeners: Set<TerminalSessionListener>;
  sentControl: string[];
  sentBytes: Uint8Array[];
};

function notifyOpen(stream: MemoryStream): void {
  for (const listener of stream.listeners) {
    listener.onOpen?.();
  }
}

function notifyControl(stream: MemoryStream, json: string): void {
  for (const listener of stream.listeners) {
    listener.onControl?.(json);
  }
}

function notifyBytes(stream: MemoryStream, data: Uint8Array): void {
  for (const listener of stream.listeners) {
    listener.onBytes?.(data);
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
  push(data: Uint8Array): void;
  pushControl(json: string): void;
  takeSentControl(): string[];
  takeSentBytes(): Uint8Array[];
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
        sentControl: [],
        sentBytes: [],
      };
      stream = current;

      const control: ControlHandle = {
        send(json) {
          if (current.state !== "open") return;
          current.sentControl.push(json);
        },
      };
      const bytes: PtyByteHandle = {
        send(data) {
          if (current.state !== "open") return;
          current.sentBytes.push(data);
        },
      };

      const handle: StreamHandle = {
        carrier: "memory",
        readyState: () => current.state,
        control,
        bytes,
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
      notifyBytes(stream, data);
    },
    pushControl(json) {
      if (!stream || stream.state !== "open") return;
      notifyControl(stream, json);
    },
    takeSentControl() {
      if (!stream) return [];
      const sent = stream.sentControl;
      stream.sentControl = [];
      return sent;
    },
    takeSentBytes() {
      if (!stream) return [];
      const sent = stream.sentBytes;
      stream.sentBytes = [];
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
