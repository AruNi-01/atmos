/**
 * HTTP gateway streaming frames + unacked-window backpressure.
 *
 * The edge `/v1/computers/:id/proxy/*` hop and the Computer outbound WebSocket
 * share these kinds. Bodies move as sequenced base64 chunks instead of one
 * whole-envelope `body_b64` field, so a large upload or log download cannot
 * pin the hub in a single multi-megabyte frame.
 */

import type { RelayEnvelope } from "./envelope";

export const HTTP_STREAM = "http";
export const HTTP_STREAM_CHUNK_SIZE = 32 * 1024;
export const HTTP_STREAM_WINDOW = 8;
export const HTTP_STREAM_IDLE_TIMEOUT_MS = 120_000;
export const HTTP_GATEWAY_PRELUDE_MAX = 256 * 1024;

export const HTTP_KIND = {
  request: "request",
  requestChunk: "request_chunk",
  requestEnd: "request_end",
  responseStart: "response_start",
  responseChunk: "response_chunk",
  responseEnd: "response_end",
  response: "response",
  ack: "ack",
  cancel: "cancel",
  error: "error",
} as const;

export type GatewayMeta = {
  method: string;
  path: string;
  headers: [string, string][];
  /** When true, request bytes follow as `request_chunk` / `request_end`. */
  streaming?: boolean;
};

export type HttpResponseStart = {
  status: number;
  headers: [string, string][];
};

export type HttpStreamError = {
  status: number;
  code: string;
};

export class AckWindow {
  private nextSeq = 0;
  private ackedSeq = -1;
  private waiters: Array<() => void> = [];
  blocked = 0;

  constructor(readonly maxUnacked: number = HTTP_STREAM_WINDOW) {}

  unacked(): number {
    return Math.max(0, this.nextSeq - this.ackedSeq - 1);
  }

  ack(seq: number): void {
    if (!Number.isInteger(seq) || seq < 0 || seq >= this.nextSeq) {
      return;
    }
    if (seq > this.ackedSeq) {
      this.ackedSeq = seq;
      const waiters = this.waiters.splice(0);
      for (const wake of waiters) {
        wake();
      }
    }
  }

  async takeSlot(signal?: AbortSignal): Promise<number> {
    if (signal?.aborted) {
      throw abortError();
    }
    for (;;) {
      if (this.unacked() < this.maxUnacked) {
        const seq = this.nextSeq;
        this.nextSeq += 1;
        return seq;
      }
      this.blocked += 1;
      await waitForWindow(this.waiters, signal);
    }
  }
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function waitForWindow(waiters: Array<() => void>, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const waiter = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      const idx = waiters.indexOf(waiter);
      if (idx >= 0) {
        waiters.splice(idx, 1);
      }
      reject(abortError());
    };
    waiters.push(waiter);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function u8ToB64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x2000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function b64ToU8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function httpEnvelope(opts: {
  kind: string;
  requestId: string;
  seq?: number;
  body?: string;
}): RelayEnvelope {
  const envelope: RelayEnvelope = {
    v: 1,
    stream: HTTP_STREAM,
    kind: opts.kind,
    request_id: opts.requestId,
  };
  if (opts.seq !== undefined) {
    envelope.seq = opts.seq;
  }
  if (opts.body !== undefined) {
    envelope.body = opts.body;
  }
  return envelope;
}

export function encodeGatewayPrelude(meta: GatewayMeta): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const out = new Uint8Array(4 + json.length);
  new DataView(out.buffer).setUint32(0, json.length);
  out.set(json, 4);
  return out;
}

class ByteReader {
  private buf = new Uint8Array(0);

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async readExact(n: number): Promise<Uint8Array | null> {
    while (this.buf.length < n) {
      const { done, value } = await this.reader.read();
      if (done) {
        return null;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      const next = new Uint8Array(this.buf.length + value.length);
      next.set(this.buf);
      next.set(value, this.buf.length);
      this.buf = next;
    }
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }

  intoStream(): ReadableStream<Uint8Array> {
    let leftover: Uint8Array | null = this.buf.length > 0 ? this.buf : null;
    this.buf = new Uint8Array(0);
    const reader = this.reader;
    return new ReadableStream({
      async pull(controller) {
        if (leftover) {
          controller.enqueue(leftover);
          leftover = null;
          return;
        }
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        if (value && value.byteLength > 0) {
          controller.enqueue(value);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
  }
}

export async function decodeGatewayStream(
  body: ReadableStream<Uint8Array> | null,
): Promise<{ meta: GatewayMeta; rest: ReadableStream<Uint8Array> }> {
  if (!body) {
    throw new Error("missing_gateway_body");
  }
  const reader = new ByteReader(body.getReader());
  const lenBytes = await reader.readExact(4);
  if (!lenBytes) {
    throw new Error("truncated_gateway_prelude");
  }
  const metaLen = new DataView(lenBytes.buffer, lenBytes.byteOffset, lenBytes.byteLength).getUint32(
    0,
  );
  if (metaLen < 2 || metaLen > HTTP_GATEWAY_PRELUDE_MAX) {
    throw new Error("invalid_gateway_prelude");
  }
  const metaBytes = await reader.readExact(metaLen);
  if (!metaBytes) {
    throw new Error("truncated_gateway_meta");
  }
  const parsed = JSON.parse(new TextDecoder().decode(metaBytes)) as GatewayMeta;
  if (!parsed || typeof parsed.method !== "string" || typeof parsed.path !== "string") {
    throw new Error("invalid_gateway_meta");
  }
  if (!Array.isArray(parsed.headers)) {
    parsed.headers = [];
  }
  return { meta: parsed, rest: reader.intoStream() };
}

async function writeWhileOpen(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  chunk: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw abortError();
  }
  if (!signal) {
    await writer.write(chunk);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    writer.write(chunk).then(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export async function pipeGatewayRequestBody(
  dest: WritableStream<Uint8Array>,
  prelude: Uint8Array,
  requestBody: ReadableStream<Uint8Array> | null,
  signal?: AbortSignal,
): Promise<void> {
  const writer = dest.getWriter();
  try {
    await writeWhileOpen(writer, prelude, signal);
    if (!requestBody) {
      await writer.close();
      return;
    }
    const reader = requestBody.getReader();
    for (;;) {
      if (signal?.aborted) {
        throw abortError();
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value && value.byteLength > 0) {
        await writeWhileOpen(writer, value, signal);
      }
    }
    await writer.close();
  } catch (error) {
    void writer.abort(error).catch(() => undefined);
    throw error;
  }
}

/** RFC 9110: these statuses must not carry a body. */
export function httpStatusNullBody(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

export type HubHttpProxyOpts = {
  send: (envelope: RelayEnvelope) => void;
  requestId: string;
  method: string;
  path: string;
  headers: [string, string][];
  requestBody: ReadableStream<Uint8Array> | null;
  signal?: AbortSignal;
  chunkSize?: number;
  windowSize?: number;
  idleTimeoutMs?: number;
  onSettled?: () => void;
};

export type HubHttpProxyHandle = {
  response: Promise<Response>;
  requestWindow: AckWindow;
  onEnvelope: (envelope: RelayEnvelope) => Promise<void>;
};

export function startHubHttpProxy(opts: HubHttpProxyOpts): HubHttpProxyHandle {
  const chunkSize = opts.chunkSize ?? HTTP_STREAM_CHUNK_SIZE;
  const idleTimeoutMs = opts.idleTimeoutMs ?? HTTP_STREAM_IDLE_TIMEOUT_MS;
  const requestWindow = new AckWindow(opts.windowSize ?? HTTP_STREAM_WINDOW);
  const abort = new AbortController();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  let responseStarted = false;
  let settled = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    opts.onSettled?.();
  };

  const send = (kind: string, extra?: { seq?: number; body?: string }) => {
    opts.send(
      httpEnvelope({
        kind,
        requestId: opts.requestId,
        seq: extra?.seq,
        body: extra?.body,
      }),
    );
  };

  let resolveResponse: (response: Response) => void;
  let rejectResponse: (error: Error) => void;
  const response = new Promise<Response>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });

  const abortWriter = (error: Error) => {
    try {
      void writer.abort(error).catch(() => undefined);
    } catch {
      /* ignore */
    }
  };

  const fail = (error: Error) => {
    if (settled) {
      return;
    }
    try {
      send(HTTP_KIND.cancel);
    } catch {
      /* peer already gone */
    }
    abort.abort();
    abortWriter(error);
    if (!responseStarted) {
      rejectResponse(error);
    }
    settle();
  };

  const bumpIdle = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
      fail(new Error("gateway_timeout"));
    }, idleTimeoutMs);
  };

  abort.signal.addEventListener(
    "abort",
    () => {
      const reason = abort.signal.reason;
      if (reason === "server_offline") {
        fail(new Error("server_offline"));
        return;
      }
      fail(abortError());
    },
    { once: true },
  );

  const linkAbort = () => {
    if (opts.signal?.aborted) {
      abort.abort(opts.signal.reason);
      return;
    }
    opts.signal?.addEventListener("abort", () => abort.abort(opts.signal?.reason), { once: true });
  };
  linkAbort();

  const pumpRequest = async () => {
    if (settled || abort.signal.aborted) {
      return;
    }
    send(HTTP_KIND.request, {
      body: JSON.stringify({
        method: opts.method,
        path: opts.path,
        headers: opts.headers,
        streaming: true,
      } satisfies GatewayMeta),
    });
    if (opts.requestBody) {
      const reader = opts.requestBody.getReader();
      let leftover = new Uint8Array(0);
      const emit = async (piece: Uint8Array) => {
        const seq = await requestWindow.takeSlot(abort.signal);
        send(HTTP_KIND.requestChunk, { seq, body: u8ToB64(piece) });
        bumpIdle();
      };
      for (;;) {
        if (abort.signal.aborted) {
          throw abortError();
        }
        const { done, value } = await reader.read();
        if (value && value.byteLength > 0) {
          if (leftover.length === 0 && value.byteLength === chunkSize) {
            await emit(value);
          } else {
            const merged = new Uint8Array(leftover.length + value.length);
            merged.set(leftover);
            merged.set(value, leftover.length);
            leftover = merged;
            while (leftover.length >= chunkSize) {
              await emit(leftover.slice(0, chunkSize));
              leftover = leftover.slice(chunkSize);
            }
          }
        }
        if (done) {
          if (leftover.length > 0) {
            await emit(leftover);
          }
          break;
        }
      }
    }
    send(HTTP_KIND.requestEnd);
    bumpIdle();
  };

  void pumpRequest().catch((error) => {
    fail(error instanceof Error ? error : new Error(String(error)));
  });

  if (!settled) {
    bumpIdle();
  }

  const onEnvelope = async (envelope: RelayEnvelope) => {
    if (settled) {
      return;
    }
    if (envelope.stream && envelope.stream !== HTTP_STREAM) {
      return;
    }
    bumpIdle();
    const kind = envelope.kind;
    if (kind === HTTP_KIND.ack && envelope.seq !== undefined) {
      requestWindow.ack(envelope.seq);
      return;
    }
    if (kind === HTTP_KIND.cancel) {
      fail(new Error("upstream_cancelled"));
      return;
    }
    if (kind === HTTP_KIND.error) {
      let parsed: HttpStreamError = { status: 502, code: "gateway_error" };
      try {
        parsed = JSON.parse(envelope.body ?? "{}") as HttpStreamError;
      } catch {
        /* keep default */
      }
      const status = typeof parsed.status === "number" ? parsed.status : 502;
      const code = parsed.code || "gateway_error";
      const error = new Error(code);
      if (!responseStarted) {
        responseStarted = true;
        resolveResponse(
          new Response(JSON.stringify({ error: code }), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } else {
        abortWriter(error);
      }
      settle();
      abort.abort(error);
      return;
    }
    if (kind === HTTP_KIND.response) {
      fulfillLegacyResponse(envelope.body ?? "{}", resolveResponse, fail);
      responseStarted = true;
      settle();
      return;
    }
    if (kind === HTTP_KIND.responseStart) {
      let start: HttpResponseStart;
      try {
        start = JSON.parse(envelope.body ?? "{}") as HttpResponseStart;
      } catch {
        fail(new Error("invalid_http_response"));
        return;
      }
      if (typeof start.status !== "number") {
        fail(new Error("invalid_http_response"));
        return;
      }
      const headers = new Headers();
      for (const [key, value] of start.headers ?? []) {
        headers.append(key, value);
      }
      if (!responseStarted) {
        responseStarted = true;
        const body = httpStatusNullBody(start.status) ? null : readable;
        if (body === null) {
          try {
            await writer.close();
          } catch {
            /* unused stream */
          }
        }
        resolveResponse(new Response(body, { status: start.status, headers }));
      }
      return;
    }
    if (kind === HTTP_KIND.responseChunk) {
      if (envelope.body) {
        try {
          await writer.write(b64ToU8(envelope.body));
        } catch (error) {
          fail(error instanceof Error ? error : new Error("client_write_failed"));
          return;
        }
      }
      if (envelope.seq !== undefined) {
        send(HTTP_KIND.ack, { seq: envelope.seq });
      }
      return;
    }
    if (kind === HTTP_KIND.responseEnd) {
      try {
        await writer.close();
      } catch {
        /* already closed */
      }
      if (!responseStarted) {
        responseStarted = true;
        resolveResponse(new Response(null, { status: 204 }));
      }
      settle();
    }
  };

  return { response, requestWindow, onEnvelope };
}

function fulfillLegacyResponse(
  payload: string,
  resolveResponse: (response: Response) => void,
  fail: (error: Error) => void,
): void {
  try {
    const parsed = JSON.parse(payload) as {
      status?: number;
      headers?: [string, string][];
      body_b64?: string | null;
    };
    if (typeof parsed.status !== "number") {
      throw new Error("invalid_http_response");
    }
    const headers = new Headers();
    for (const [key, value] of parsed.headers ?? []) {
      headers.append(key, value);
    }
    let body: Uint8Array | null = null;
    if (parsed.body_b64 && !httpStatusNullBody(parsed.status)) {
      body = b64ToU8(parsed.body_b64);
    }
    resolveResponse(new Response(body, { status: parsed.status, headers }));
  } catch {
    fail(new Error("invalid_http_response"));
  }
}
