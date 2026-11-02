import { afterAll, describe, expect, mock, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  decodeB64Url,
  deriveRelayHttpE2eeKey,
  e2eeAad,
  encodeB64Url,
  encodeLengthPrefixed,
  generateX25519KeyPair,
  openHttpResponseRecord,
  openRecord,
  readLengthPrefixedRecord,
  RELAY_E2EE_ALG,
  sealRecord,
} from "../../relay-client/src/e2ee";
import type { RelayEnvelope } from "../src/envelope";
import {
  AckWindow,
  b64ToU8,
  decodeGatewayStream,
  encodeGatewayPrelude,
  HTTP_KIND,
  HTTP_STREAM_CHUNK_SIZE,
  HTTP_STREAM_WINDOW,
  httpEnvelope,
  httpStatusNullBody,
  pipeGatewayRequestBody,
  startHubHttpProxy,
  u8ToB64,
  type GatewayMeta,
} from "../src/http-stream";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

type TraceEvent = {
  tMs: number;
  hop: "edge-hub" | "hub-computer" | "computer-upstream";
  dir: "out" | "in";
  kind?: string;
  seq?: number;
  bytes?: number;
  unacked?: number;
  blocked?: number;
  note?: string;
};

const TRACE_DIR = process.env.ATMOS_TRUE_LINK_DIR;

async function dumpTrace(name: string, payload: unknown): Promise<void> {
  if (!TRACE_DIR) {
    return;
  }
  await mkdir(TRACE_DIR, { recursive: true });
  await writeFile(join(TRACE_DIR, name), `${JSON.stringify(payload, null, 2)}\n`);
}

function bytesOf(size: number, fill = 0x61): Uint8Array {
  return new Uint8Array(size).fill(fill);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wireEnvelope(envelope: RelayEnvelope): RelayEnvelope {
  return JSON.parse(JSON.stringify(envelope)) as RelayEnvelope;
}

function b64ToU8Safe(body: string, kind: string): number {
  if (
    kind === HTTP_KIND.requestChunk ||
    kind === HTTP_KIND.responseChunk ||
    kind === HTTP_KIND.response
  ) {
    try {
      return b64ToU8(body).byteLength;
    } catch {
      return body.length;
    }
  }
  return new TextEncoder().encode(body).byteLength;
}

function startUpstream(): {
  origin: string;
  stop: () => void;
  stats: { cancelled: boolean; received: number; requests: number };
} {
  const stats = { cancelled: false, received: 0, requests: 0 };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      stats.requests += 1;
      const url = new URL(request.url);
      request.signal.addEventListener(
        "abort",
        () => {
          stats.cancelled = true;
        },
        { once: true },
      );
      if (url.pathname === "/echo" && request.method === "PUT") {
        const body = new Uint8Array(await request.arrayBuffer());
        stats.received += body.byteLength;
        return new Response(body, {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      if (url.pathname === "/slow") {
        return new Response(
          new ReadableStream<Uint8Array>({
            async pull(controller) {
              if (request.signal.aborted) {
                stats.cancelled = true;
                controller.close();
                return;
              }
              controller.enqueue(bytesOf(4096, 0x78));
              await delay(15);
            },
            cancel() {
              stats.cancelled = true;
            },
          }),
          { headers: { "content-type": "application/octet-stream" } },
        );
      }
      if (url.pathname === "/empty") {
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/reset") {
        return new Response(null, { status: 205 });
      }
      if (url.pathname === "/not-modified") {
        return new Response(null, { status: 304 });
      }
      return new Response("missing", { status: 404 });
    },
  });
  return {
    origin: `http://${server.hostname}:${server.port}`,
    stop: () => server.stop(true),
    stats,
  };
}

function createComputerPeer(opts: {
  origin: string;
  sendToHub: (envelope: RelayEnvelope) => void;
  traces: TraceEvent[];
  startedAt: number;
  ackDelayMs: number;
  e2ee?: { secretKey: Uint8Array; publicKey: Uint8Array };
}) {
  const responseWindow = new AckWindow(2);
  let requestId = "";
  let meta: GatewayMeta = { method: "GET", path: "/", headers: [] };
  const parts: Uint8Array[] = [];
  const abort = new AbortController();

  const send = (envelope: RelayEnvelope) => {
    opts.traces.push({
      tMs: Date.now() - opts.startedAt,
      hop: "hub-computer",
      dir: "in",
      kind: envelope.kind,
      seq: envelope.seq,
      bytes: envelope.body ? b64ToU8Safe(envelope.body, envelope.kind) : 0,
    });
    opts.sendToHub(wireEnvelope(envelope));
  };

  async function handle(envelope: RelayEnvelope): Promise<void> {
    if (envelope.kind === HTTP_KIND.request) {
      requestId = envelope.request_id ?? "";
      meta = JSON.parse(envelope.body ?? "{}") as GatewayMeta;
      return;
    }
    if (envelope.kind === HTTP_KIND.requestChunk && envelope.body) {
      let bytes = b64ToU8(envelope.body);
      if (opts.e2ee && meta.e2ee && envelope.seq !== undefined) {
        const key = sessionKey(opts.e2ee, meta);
        bytes = openRecord(key, e2eeAad(requestId, envelope.seq, "request_chunk"), bytes);
      }
      parts.push(bytes);
      await delay(opts.ackDelayMs);
      send(httpEnvelope({ kind: HTTP_KIND.ack, requestId, seq: envelope.seq }));
      return;
    }
    if (envelope.kind === HTTP_KIND.ack && envelope.seq !== undefined) {
      responseWindow.ack(envelope.seq);
      return;
    }
    if (envelope.kind === HTTP_KIND.cancel) {
      abort.abort();
      return;
    }
    if (envelope.kind !== HTTP_KIND.requestEnd) {
      return;
    }

    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const body = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.byteLength;
    }
    const method = (meta.method || "GET").toUpperCase();
    opts.traces.push({
      tMs: Date.now() - opts.startedAt,
      hop: "computer-upstream",
      dir: "out",
      bytes: body.byteLength,
      note: `${method} ${meta.path}`,
    });
    let response: Response;
    try {
      response = await fetch(`${opts.origin}${meta.path}`, {
        method,
        headers: { "content-type": "application/octet-stream" },
        body: method === "GET" || method === "HEAD" ? undefined : body,
        signal: abort.signal,
      });
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      send(
        httpEnvelope({
          kind: HTTP_KIND.error,
          requestId,
          body: JSON.stringify({
            status: 502,
            code: error instanceof Error ? error.message : "upstream_unreachable",
          }),
        }),
      );
      return;
    }
    send(
      httpEnvelope({
        kind: HTTP_KIND.responseStart,
        requestId,
        body: JSON.stringify({
          status: response.status,
          headers: [...response.headers.entries()],
        }),
      }),
    );
    if (response.body && !httpStatusNullBody(response.status)) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          if (abort.signal.aborted) {
            break;
          }
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (!value || value.byteLength === 0) {
            continue;
          }
          let cursor = 0;
          while (cursor < value.byteLength) {
            const end = Math.min(value.byteLength, cursor + HTTP_STREAM_CHUNK_SIZE);
            const seq = await responseWindow.takeSlot(abort.signal);
            let piece = value.slice(cursor, end);
            if (opts.e2ee && meta.e2ee) {
              const key = sessionKey(opts.e2ee, meta);
              piece = sealRecord(key, e2eeAad(requestId, seq, "response_chunk"), piece);
            }
            send(
              httpEnvelope({
                kind: HTTP_KIND.responseChunk,
                requestId,
                seq,
                body: u8ToB64(piece),
              }),
            );
            cursor = end;
          }
        }
      } catch {
        if (!abort.signal.aborted) {
          send(
            httpEnvelope({
              kind: HTTP_KIND.error,
              requestId,
              body: JSON.stringify({ status: 502, code: "upstream_body_error" }),
            }),
          );
        }
        return;
      }
    }
    if (!abort.signal.aborted) {
      if (opts.e2ee && meta.e2ee) {
        const seq = await responseWindow.takeSlot(abort.signal);
        const key = sessionKey(opts.e2ee, meta);
        const end = sealRecord(key, e2eeAad(requestId, seq, "response_end"), new Uint8Array(0));
        send(
          httpEnvelope({
            kind: HTTP_KIND.responseChunk,
            requestId,
            seq,
            body: u8ToB64(end),
          }),
        );
      }
      send(httpEnvelope({ kind: HTTP_KIND.responseEnd, requestId }));
    }
  }

  return {
    onEnvelope: (envelope: RelayEnvelope) => {
      void handle(envelope);
    },
  };
}

function sessionKey(
  computer: { secretKey: Uint8Array; publicKey: Uint8Array },
  meta: GatewayMeta,
): Uint8Array {
  const ephPk = decodeB64Url(meta.e2ee!.eph_pk);
  return deriveRelayHttpE2eeKey({
    localSecret: computer.secretKey,
    peerPublic: ephPk,
    ephPublic: ephPk,
    staticPublic: computer.publicKey,
  });
}

describe("true-link HTTP gateway (in-process Worker prelude + hub helper + computer HTTP)", () => {
  const stops: Array<() => void> = [];
  afterAll(() => {
    for (const stop of stops) {
      stop();
    }
  });

  test("streams several MiB as sequenced chunks with a full unacked window", async () => {
    const payload = bytesOf(4 * 1024 * 1024, 0x5a);
    const startedAt = Date.now();
    const traces: TraceEvent[] = [];
    const chunkSizes: number[] = [];
    const upstream = startUpstream();
    stops.push(upstream.stop);
    const requestId = "true-link-large";
    const hub: {
      onEnvelope?: (envelope: RelayEnvelope) => Promise<void>;
      unacked?: () => number;
      blocked?: () => number;
    } = {};

    const computer = createComputerPeer({
      origin: upstream.origin,
      sendToHub: (envelope) => {
        void hub.onEnvelope?.(wireEnvelope(envelope));
      },
      traces,
      startedAt,
      ackDelayMs: 8,
    });

    const prelude = encodeGatewayPrelude({
      method: "PUT",
      path: "/echo",
      headers: [["content-type", "application/octet-stream"]],
    });
    traces.push({
      tMs: 0,
      hop: "edge-hub",
      dir: "out",
      bytes: prelude.byteLength + payload.byteLength,
      note: "length-prefixed JSON prelude + raw body (not whole-envelope body_b64)",
    });
    const { readable, writable } = new TransformStream<Uint8Array>();
    void pipeGatewayRequestBody(
      writable,
      prelude,
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(payload);
          controller.close();
        },
      }),
    );
    const decoded = await decodeGatewayStream(readable);

    const handle = startHubHttpProxy({
      send: (envelope) => {
        if (envelope.kind === HTTP_KIND.requestChunk && envelope.body) {
          chunkSizes.push(b64ToU8(envelope.body).byteLength);
        }
        traces.push({
          tMs: Date.now() - startedAt,
          hop: "hub-computer",
          dir: "out",
          kind: envelope.kind,
          seq: envelope.seq,
          bytes: envelope.body ? b64ToU8Safe(envelope.body, envelope.kind) : 0,
          unacked: hub.unacked?.() ?? 0,
          blocked: hub.blocked?.() ?? 0,
        });
        computer.onEnvelope(wireEnvelope(envelope));
      },
      requestId,
      method: decoded.meta.method,
      path: decoded.meta.path,
      headers: decoded.meta.headers as [string, string][],
      requestBody: decoded.rest,
      windowSize: HTTP_STREAM_WINDOW,
      idleTimeoutMs: 30_000,
    });
    hub.onEnvelope = handle.onEnvelope;
    hub.unacked = () => handle.requestWindow.unacked();
    hub.blocked = () => handle.requestWindow.blocked;

    const response = await handle.response;
    const echoed = new Uint8Array(await response.arrayBuffer());
    const requestChunks = traces.filter(
      (event) =>
        event.hop === "hub-computer" &&
        event.dir === "out" &&
        event.kind === HTTP_KIND.requestChunk,
    );
    const maxUnacked = Math.max(0, ...requestChunks.map((event) => event.unacked ?? 0));
    const summary = {
      bytes: payload.byteLength,
      status: response.status,
      requestChunks: requestChunks.length,
      maxChunkBytes: Math.max(0, ...chunkSizes),
      maxUnacked,
      blocked: handle.requestWindow.blocked,
      wholeBodyEnvelope: traces.some(
        (event) => event.kind === HTTP_KIND.response && (event.bytes ?? 0) === payload.byteLength,
      ),
      upstreamReceived: upstream.stats.received,
    };
    await dumpTrace("01-streaming.json", {
      summary,
      tracesHead: traces.slice(0, 40),
      tracesTail: traces.slice(-20),
    });
    await dumpTrace("02-backpressure.json", {
      window: HTTP_STREAM_WINDOW,
      chunkSize: HTTP_STREAM_CHUNK_SIZE,
      maxUnacked,
      blocked: handle.requestWindow.blocked,
      sample: requestChunks.slice(0, 16),
    });

    expect(response.status).toBe(200);
    expect(echoed.byteLength).toBe(payload.byteLength);
    expect(echoed).toEqual(payload);
    expect(upstream.stats.received).toBe(payload.byteLength);
    expect(requestChunks.length).toBeGreaterThan(8);
    expect(Math.max(...chunkSizes)).toBeLessThanOrEqual(HTTP_STREAM_CHUNK_SIZE);
    expect(maxUnacked).toBeLessThanOrEqual(HTTP_STREAM_WINDOW);
    expect(handle.requestWindow.blocked).toBeGreaterThan(0);
    expect(summary.wholeBodyEnvelope).toBe(false);
  }, 60_000);

  test("client abort emits cancel and stops the upstream body", async () => {
    const startedAt = Date.now();
    const traces: TraceEvent[] = [];
    const upstream = startUpstream();
    stops.push(upstream.stop);
    const abort = new AbortController();
    const hub: { onEnvelope?: (envelope: RelayEnvelope) => Promise<void> } = {};
    const computer = createComputerPeer({
      origin: upstream.origin,
      sendToHub: (envelope) => {
        traces.push({
          tMs: Date.now() - startedAt,
          hop: "hub-computer",
          dir: "in",
          kind: envelope.kind,
          seq: envelope.seq,
        });
        void hub.onEnvelope?.(wireEnvelope(envelope));
      },
      traces,
      startedAt,
      ackDelayMs: 0,
    });

    const handle = startHubHttpProxy({
      send: (envelope) => {
        traces.push({
          tMs: Date.now() - startedAt,
          hop: "hub-computer",
          dir: "out",
          kind: envelope.kind,
          seq: envelope.seq,
        });
        computer.onEnvelope(wireEnvelope(envelope));
      },
      requestId: "true-link-cancel",
      method: "GET",
      path: "/slow",
      headers: [],
      requestBody: null,
      signal: abort.signal,
      idleTimeoutMs: 20_000,
    });
    hub.onEnvelope = handle.onEnvelope;

    for (let i = 0; i < 50; i += 1) {
      if (traces.some((event) => event.kind === HTTP_KIND.responseStart)) {
        break;
      }
      await delay(10);
    }
    const pending = handle.response.then(
      (response) => ({ ok: true as const, response }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    abort.abort();
    const settled = await pending;
    for (let i = 0; i < 200 && !upstream.stats.cancelled; i += 1) {
      await delay(10);
    }
    const cancel = traces.find((event) => event.kind === HTTP_KIND.cancel && event.dir === "out");
    await dumpTrace("03-cancel.json", {
      cancel,
      settled: settled.ok ? { status: settled.response.status } : { error: String(settled.error) },
      upstreamCancelled: upstream.stats.cancelled,
      traces,
    });
    expect(cancel).toBeTruthy();
    expect(upstream.stats.cancelled).toBe(true);
  }, 20_000);

  test("null-body statuses stay null across 204/205/304", async () => {
    const cases = [
      { path: "/empty", status: 204 },
      { path: "/reset", status: 205 },
      { path: "/not-modified", status: 304 },
    ];
    const results = [];
    for (const item of cases) {
      const handle = startHubHttpProxy({
        send: () => undefined,
        requestId: `null-${item.status}`,
        method: "GET",
        path: item.path,
        headers: [],
        requestBody: null,
        idleTimeoutMs: 10_000,
      });
      await handle.onEnvelope(
        httpEnvelope({
          kind: HTTP_KIND.responseStart,
          requestId: `null-${item.status}`,
          body: JSON.stringify({ status: item.status, headers: [] }),
        }),
      );
      const response = await handle.response;
      results.push({
        status: response.status,
        bodyIsNull: response.body === null,
        helper: httpStatusNullBody(item.status),
      });
      expect(response.status).toBe(item.status);
      expect(response.body).toBeNull();
    }
    await dumpTrace("04-null-body.json", results);
  });

  test("legacy whole-body response still fulfills", async () => {
    const payload = bytesOf(1024, 7);
    const handle = startHubHttpProxy({
      send: () => undefined,
      requestId: "legacy-response",
      method: "GET",
      path: "/echo",
      headers: [],
      requestBody: null,
      idleTimeoutMs: 10_000,
    });
    await handle.onEnvelope(
      httpEnvelope({
        kind: HTTP_KIND.response,
        requestId: "legacy-response",
        body: JSON.stringify({
          status: 200,
          headers: [["content-type", "application/octet-stream"]],
          body_b64: u8ToB64(payload),
        }),
      }),
    );
    const response = await handle.response;
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload);
  });

  test("error after response_start aborts the body reader", async () => {
    const handle = startHubHttpProxy({
      send: () => undefined,
      requestId: "true-link-mid-error",
      method: "GET",
      path: "/partial",
      headers: [],
      requestBody: null,
      idleTimeoutMs: 10_000,
    });
    await handle.onEnvelope(
      httpEnvelope({
        kind: HTTP_KIND.responseStart,
        requestId: "true-link-mid-error",
        body: JSON.stringify({
          status: 200,
          headers: [["content-type", "application/octet-stream"]],
        }),
      }),
    );
    const response = await handle.response;
    const body = response.arrayBuffer();
    await handle.onEnvelope(
      httpEnvelope({
        kind: HTTP_KIND.error,
        requestId: "true-link-mid-error",
        body: JSON.stringify({ status: 502, code: "upstream_body_error" }),
      }),
    );
    await expect(body).rejects.toBeTruthy();
    await dumpTrace("04-error-after-start.json", {
      status: response.status,
      bodyRejected: true,
    });
  });

  test("worker proxy hop keeps a 2 MiB upload as prelude plus raw bytes", async () => {
    const { default: worker } = await import("../src/index");
    let captured: Uint8Array | null = null;
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind() {
              return {
                async first() {
                  if (sql.includes("client_sessions")) {
                    return { ok: 1 };
                  }
                  return null;
                },
              };
            },
          };
        },
      },
      SERVER_HUB: {
        idFromName: () => "hub",
        get: () => ({
          fetch: async (request: Request) => {
            captured = new Uint8Array(await request.arrayBuffer());
            return new Response("ok", { status: 200 });
          },
        }),
      },
      PT_DESIGN_ROOM: {
        idFromName: () => "room",
        get: () => ({ fetch: async () => new Response(null) }),
      },
    };
    const payload = bytesOf(2 * 1024 * 1024, 0x42);
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/v1/computers/srv-1/proxy/api/system/file", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${"a".repeat(32)}`,
          "content-type": "application/octet-stream",
        },
        body: payload,
      }),
      env as never,
      { waitUntil() {} } as never,
    );
    expect(response.status).toBe(200);
    expect(captured).not.toBeNull();
    const decoded = await decodeGatewayStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(captured!);
          controller.close();
        },
      }),
    );
    const rest = new Uint8Array(await new Response(decoded.rest).arrayBuffer());
    expect(decoded.meta.method).toBe("PUT");
    expect(rest).toEqual(payload);
    expect(captured!.byteLength).toBeGreaterThan(payload.byteLength);
    await dumpTrace("01-streaming-worker-prelude.json", {
      payloadBytes: payload.byteLength,
      framedBytes: captured!.byteLength,
      preludeBytes: captured!.byteLength - rest.byteLength,
      path: decoded.meta.path,
    });
  }, 30_000);

  test("streams several MiB with HTTP E2EE on and keeps plaintext compatible", async () => {
    const payload = bytesOf(2 * 1024 * 1024, 0x3c);
    const startedAt = Date.now();
    const traces: TraceEvent[] = [];
    const upstream = startUpstream();
    stops.push(upstream.stop);
    const computerKeys = generateX25519KeyPair();
    const clientEph = generateX25519KeyPair();
    const requestId = "true-link-e2ee";
    const key = deriveRelayHttpE2eeKey({
      localSecret: clientEph.secretKey,
      peerPublic: computerKeys.publicKey,
      ephPublic: clientEph.publicKey,
      staticPublic: computerKeys.publicKey,
    });
    const records: Uint8Array[] = [];
    let offset = 0;
    let seq = 0;
    while (offset < payload.byteLength) {
      const end = Math.min(payload.byteLength, offset + HTTP_STREAM_CHUNK_SIZE);
      const sealed = sealRecord(
        key,
        e2eeAad(requestId, seq, "request_chunk"),
        payload.slice(offset, end),
      );
      records.push(encodeLengthPrefixed(sealed));
      offset = end;
      seq += 1;
    }
    const framed = new Uint8Array(records.reduce((sum, record) => sum + record.byteLength, 0));
    let at = 0;
    for (const record of records) {
      framed.set(record, at);
      at += record.byteLength;
    }

    const hub: {
      onEnvelope?: (envelope: RelayEnvelope) => Promise<void>;
      blocked?: () => number;
    } = {};
    const computer = createComputerPeer({
      origin: upstream.origin,
      sendToHub: (envelope) => {
        void hub.onEnvelope?.(wireEnvelope(envelope));
      },
      traces,
      startedAt,
      ackDelayMs: 4,
      e2ee: computerKeys,
    });
    const prelude = encodeGatewayPrelude({
      method: "PUT",
      path: "/echo",
      headers: [["content-type", "application/octet-stream"]],
      e2ee: {
        v: 1,
        alg: RELAY_E2EE_ALG,
        request_id: requestId,
        eph_pk: encodeB64Url(clientEph.publicKey),
      },
    });
    const { readable, writable } = new TransformStream<Uint8Array>();
    void pipeGatewayRequestBody(
      writable,
      prelude,
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(framed);
          controller.close();
        },
      }),
    );
    const decoded = await decodeGatewayStream(readable);
    const handle = startHubHttpProxy({
      send: (envelope) => {
        traces.push({
          tMs: Date.now() - startedAt,
          hop: "hub-computer",
          dir: "out",
          kind: envelope.kind,
          seq: envelope.seq,
          bytes: envelope.body ? b64ToU8Safe(envelope.body, envelope.kind) : 0,
        });
        computer.onEnvelope(wireEnvelope(envelope));
      },
      requestId,
      method: decoded.meta.method,
      path: decoded.meta.path,
      headers: decoded.meta.headers as [string, string][],
      requestBody: decoded.rest,
      presealed: true,
      e2ee: decoded.meta.e2ee,
      windowSize: HTTP_STREAM_WINDOW,
      idleTimeoutMs: 30_000,
    });
    hub.onEnvelope = handle.onEnvelope;
    hub.blocked = () => handle.requestWindow.blocked;

    const response = await handle.response;
    expect(response.headers.get("X-Atmos-E2EE")).toBe("1");
    const leftover = { buf: new Uint8Array(0) };
    const reader = response.body!.getReader();
    const opened: Uint8Array[] = [];
    let replySeq = 0;
    for (;;) {
      const record = await readLengthPrefixedRecord(reader, leftover);
      if (!record) {
        throw new Error("e2ee_truncated_stream");
      }
      const step = openHttpResponseRecord(key, requestId, replySeq, record);
      replySeq += 1;
      if (step.final) {
        break;
      }
      opened.push(step.plain);
    }
    const echoed = new Uint8Array(opened.reduce((sum, part) => sum + part.byteLength, 0));
    at = 0;
    for (const part of opened) {
      echoed.set(part, at);
      at += part.byteLength;
    }
    await dumpTrace("05-e2ee-streaming.json", {
      bytes: payload.byteLength,
      status: response.status,
      requestChunks: traces.filter((event) => event.kind === HTTP_KIND.requestChunk).length,
      blocked: handle.requestWindow.blocked,
      e2ee: true,
    });
    expect(response.status).toBe(200);
    expect(echoed).toEqual(payload);
    expect(upstream.stats.received).toBe(payload.byteLength);
    expect(handle.requestWindow.blocked).toBeGreaterThan(0);

    const plain = startHubHttpProxy({
      send: (envelope) => {
        if (envelope.kind === HTTP_KIND.request) {
          expect(JSON.parse(envelope.body ?? "{}").e2ee).toBeUndefined();
        }
      },
      requestId: "plaintext-compat",
      method: "GET",
      path: "/empty",
      headers: [],
      requestBody: null,
    });
    await plain.onEnvelope(
      httpEnvelope({
        kind: HTTP_KIND.responseStart,
        requestId: "plaintext-compat",
        body: JSON.stringify({ status: 204, headers: [] }),
      }),
    );
    await plain.onEnvelope(
      httpEnvelope({ kind: HTTP_KIND.responseEnd, requestId: "plaintext-compat" }),
    );
    const plainResponse = await plain.response;
    expect(plainResponse.status).toBe(204);
    expect(plainResponse.headers.get("X-Atmos-E2EE")).toBeNull();
  }, 60_000);

  test("cancel still aborts upstream when HTTP E2EE is on", async () => {
    const startedAt = Date.now();
    const traces: TraceEvent[] = [];
    const upstream = startUpstream();
    stops.push(upstream.stop);
    const abort = new AbortController();
    const computerKeys = generateX25519KeyPair();
    const clientEph = generateX25519KeyPair();
    const requestId = "true-link-e2ee-cancel";
    const hub: { onEnvelope?: (envelope: RelayEnvelope) => Promise<void> } = {};
    const computer = createComputerPeer({
      origin: upstream.origin,
      sendToHub: (envelope) => {
        traces.push({
          tMs: Date.now() - startedAt,
          hop: "hub-computer",
          dir: "in",
          kind: envelope.kind,
          seq: envelope.seq,
        });
        void hub.onEnvelope?.(wireEnvelope(envelope));
      },
      traces,
      startedAt,
      ackDelayMs: 0,
      e2ee: computerKeys,
    });

    const handle = startHubHttpProxy({
      send: (envelope) => {
        traces.push({
          tMs: Date.now() - startedAt,
          hop: "hub-computer",
          dir: "out",
          kind: envelope.kind,
          seq: envelope.seq,
        });
        computer.onEnvelope(wireEnvelope(envelope));
      },
      requestId,
      method: "GET",
      path: "/slow",
      headers: [],
      requestBody: null,
      signal: abort.signal,
      presealed: true,
      e2ee: {
        v: 1,
        alg: RELAY_E2EE_ALG,
        request_id: requestId,
        eph_pk: encodeB64Url(clientEph.publicKey),
      },
      idleTimeoutMs: 20_000,
    });
    hub.onEnvelope = handle.onEnvelope;

    for (let i = 0; i < 50; i += 1) {
      if (traces.some((event) => event.kind === HTTP_KIND.responseStart)) {
        break;
      }
      await delay(10);
    }
    const pending = handle.response.then(
      (response) => ({ ok: true as const, response }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    abort.abort();
    const settled = await pending;
    for (let i = 0; i < 200 && !upstream.stats.cancelled; i += 1) {
      await delay(10);
    }
    const cancel = traces.find((event) => event.kind === HTTP_KIND.cancel && event.dir === "out");
    await dumpTrace("06-e2ee-cancel.json", {
      cancel,
      settled: settled.ok ? { status: settled.response.status } : { error: String(settled.error) },
      upstreamCancelled: upstream.stats.cancelled,
      e2ee: true,
    });
    expect(cancel).toBeTruthy();
    expect(upstream.stats.cancelled).toBe(true);
  }, 20_000);
});
