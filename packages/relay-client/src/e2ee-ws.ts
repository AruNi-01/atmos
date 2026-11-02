import {
  prepareRelayFrameSocket,
  type RelayE2eeOffer,
  type RelayFrameCodec,
  type RelayFrameStream,
} from "./e2ee";

export type RelayE2eeSocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  ping?: (onPong: (error?: Error) => void) => void;
  onopen: ((event?: unknown) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
};

function isRelayCtrl(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { type?: unknown };
    return parsed?.type === "relay_ctrl";
  } catch {
    return false;
  }
}

/** Seal/open text frames on a Relay app or terminal WebSocket. */
export function wrapRelayE2eeSocket<T extends RelayE2eeSocketLike>(
  raw: T,
  codec: RelayFrameCodec,
): T {
  let inbound: T["onmessage"] = null;
  const wrapped: RelayE2eeSocketLike = {
    get readyState() {
      return raw.readyState;
    },
    send(data: string) {
      raw.send(codec.sealUp(data));
    },
    close(code?: number, reason?: string) {
      raw.close(code, reason);
    },
    ping: raw.ping ? (onPong) => raw.ping!(onPong) : undefined,
    get onopen() {
      return raw.onopen;
    },
    set onopen(fn) {
      raw.onopen = fn;
    },
    get onclose() {
      return raw.onclose;
    },
    set onclose(fn) {
      raw.onclose = fn;
    },
    get onerror() {
      return raw.onerror;
    },
    set onerror(fn) {
      raw.onerror = fn;
    },
    get onmessage() {
      return inbound;
    },
    set onmessage(fn) {
      inbound = fn;
      raw.onmessage = (event) => {
        const text = String(event.data);
        if (isRelayCtrl(text)) {
          fn?.({ data: text });
          return;
        }
        let opened: string;
        try {
          opened = codec.openDown(text);
        } catch {
          try {
            raw.close(4003, "e2ee_open_failed");
          } catch {
            /* ignore */
          }
          return;
        }
        fn?.({ data: opened });
      };
    },
  };
  return wrapped as T;
}

/** Fresh ephemeral per socket so reconnects do not reuse seq/key state. */
export function attachRelayFrameE2ee<T>(
  create: (url: string) => T,
  url: string,
  offer: RelayE2eeOffer | null | undefined,
  stream: RelayFrameStream,
): T {
  const prepared = prepareRelayFrameSocket(url, offer, stream);
  const raw = create(prepared.url);
  return prepared.codec
    ? (wrapRelayE2eeSocket(raw as RelayE2eeSocketLike, prepared.codec) as T)
    : raw;
}
