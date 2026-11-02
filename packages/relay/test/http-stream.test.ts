import { describe, expect, test } from "bun:test";
import type { RelayEnvelope } from "../src/envelope";
import {
  AckWindow,
  b64ToU8,
  decodeGatewayStream,
  encodeGatewayPrelude,
  HTTP_KIND,
  HTTP_STREAM_CHUNK_SIZE,
  httpEnvelope,
  httpStatusNullBody,
  pipeGatewayRequestBody,
  startHubHttpProxy,
  u8ToB64,
} from "../src/http-stream";

function bytesOf(size: number, fill = 0x61): Uint8Array {
  return new Uint8Array(size).fill(fill);
}

function streamOf(data: Uint8Array, pieceSize = 16_384): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= data.length) {
        controller.close();
        return;
      }
      const end = Math.min(data.length, offset + pieceSize);
      controller.enqueue(data.slice(offset, end));
      offset = end;
    },
  });
}

describe("AckWindow", () => {
  test("blocks once the unacked window is full and resumes on ack", async () => {
    const window = new AckWindow(2);
    const first = await window.takeSlot();
    const second = await window.takeSlot();
    expect([first, second]).toEqual([0, 1]);
    expect(window.unacked()).toBe(2);

    let released = false;
    const third = window.takeSlot().then((seq) => {
      released = true;
      return seq;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    expect(window.blocked).toBe(1);

    window.ack(0);
    await expect(third).resolves.toBe(2);
    expect(released).toBe(true);
    expect(window.unacked()).toBe(2);
  });

  test("ignores acks for sequences that were never sent", async () => {
    const window = new AckWindow(2);
    await window.takeSlot();
    window.ack(99);
    window.ack(0.5);
    expect(window.unacked()).toBe(1);
    await window.takeSlot();
    expect(window.unacked()).toBe(2);
    window.ack(0);
    expect(window.unacked()).toBe(1);
  });

  test("aborts takeSlot when the signal fires", async () => {
    const window = new AckWindow(1);
    await window.takeSlot();
    const abort = new AbortController();
    const pending = window.takeSlot(abort.signal);
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("gateway prelude framing", () => {
  test("round-trips metadata and remaining body bytes", async () => {
    const meta = {
      method: "POST",
      path: "/api/system/file",
      headers: [["content-type", "application/octet-stream"] as [string, string]],
      streaming: true,
    };
    const prelude = encodeGatewayPrelude(meta);
    const body = bytesOf(100, 7);
    const framed = new Uint8Array(prelude.length + body.length);
    framed.set(prelude);
    framed.set(body, prelude.length);

    const decoded = await decodeGatewayStream(streamOf(framed, 9));
    expect(decoded.meta).toEqual(meta);
    const rest = new Uint8Array(await new Response(decoded.rest).arrayBuffer());
    expect(rest).toEqual(body);
  });
});

describe("hub HTTP stream proxy", () => {
  test("streams a several-megabyte body through the unacked window", async () => {
    const payload = bytesOf(4 * 1024 * 1024, 0x5a);
    const sent: RelayEnvelope[] = [];
    const requestId = "req-large";
    let handleOnEnvelope: ((envelope: RelayEnvelope) => Promise<void>) | undefined;
    const upload = new Uint8Array(payload.length);
    let uploadAt = 0;
    let maxUnacked = 0;
    let pendingResponse = 0;
    const responseAcks: number[] = [];

    const handle = startHubHttpProxy({
      send: (envelope) => {
        sent.push(envelope);
        void (async () => {
          if (
            envelope.kind === HTTP_KIND.requestChunk &&
            envelope.seq !== undefined &&
            envelope.body
          ) {
            const piece = b64ToU8(envelope.body);
            upload.set(piece, uploadAt);
            uploadAt += piece.length;
            maxUnacked = Math.max(maxUnacked, handle.requestWindow.unacked());
            await new Promise((resolve) => setTimeout(resolve, 5));
            await handleOnEnvelope?.(
              httpEnvelope({ kind: HTTP_KIND.ack, requestId, seq: envelope.seq }),
            );
          }
          if (envelope.kind === HTTP_KIND.requestEnd) {
            await handleOnEnvelope?.(
              httpEnvelope({
                kind: HTTP_KIND.responseStart,
                requestId,
                body: JSON.stringify({
                  status: 200,
                  headers: [["content-type", "application/octet-stream"]],
                }),
              }),
            );
            let offset = 0;
            let seq = 0;
            while (offset < uploadAt) {
              while (pendingResponse >= 2) {
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
              const end = Math.min(uploadAt, offset + HTTP_STREAM_CHUNK_SIZE);
              const piece = upload.slice(offset, end);
              pendingResponse += 1;
              await handleOnEnvelope?.(
                httpEnvelope({
                  kind: HTTP_KIND.responseChunk,
                  requestId,
                  seq,
                  body: u8ToB64(piece),
                }),
              );
              offset = end;
              seq += 1;
            }
            await handleOnEnvelope?.(httpEnvelope({ kind: HTTP_KIND.responseEnd, requestId }));
          }
          if (envelope.kind === HTTP_KIND.ack && envelope.seq !== undefined) {
            responseAcks.push(envelope.seq);
            pendingResponse = Math.max(0, pendingResponse - 1);
          }
        })();
      },
      requestId,
      method: "PUT",
      path: "/api/system/file",
      headers: [["content-type", "application/octet-stream"]],
      requestBody: streamOf(payload),
      windowSize: 2,
      idleTimeoutMs: 20_000,
    });
    handleOnEnvelope = handle.onEnvelope;

    const response = await handle.response;
    expect(response.status).toBe(200);
    const echoed = new Uint8Array(await response.arrayBuffer());
    expect(echoed.byteLength).toBe(payload.byteLength);
    expect(echoed).toEqual(payload);
    expect(upload).toEqual(payload);
    expect(maxUnacked).toBeLessThanOrEqual(2);
    expect(handle.requestWindow.blocked).toBeGreaterThan(0);
    expect(sent.some((envelope) => envelope.kind === HTTP_KIND.requestChunk)).toBe(true);
    expect(responseAcks.length).toBeGreaterThan(0);
  });

  test("emits cancel when the client aborts before the Computer responds", async () => {
    const abort = new AbortController();
    const sent: RelayEnvelope[] = [];
    const handle = startHubHttpProxy({
      send: (envelope) => {
        sent.push(envelope);
      },
      requestId: "req-cancel",
      method: "GET",
      path: "/slow",
      headers: [],
      requestBody: null,
      signal: abort.signal,
      idleTimeoutMs: 20_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    abort.abort();
    await expect(handle.response).rejects.toMatchObject({ name: "AbortError" });
    expect(
      sent.some(
        (envelope) => envelope.kind === HTTP_KIND.cancel && envelope.request_id === "req-cancel",
      ),
    ).toBe(true);
  });

  test("idle timeout rejects with gateway_timeout not AbortError", async () => {
    const sent: RelayEnvelope[] = [];
    const handle = startHubHttpProxy({
      send: (envelope) => {
        sent.push(envelope);
      },
      requestId: "req-idle",
      method: "GET",
      path: "/slow",
      headers: [],
      requestBody: null,
      idleTimeoutMs: 30,
    });
    await expect(handle.response).rejects.toMatchObject({ message: "gateway_timeout" });
    expect(sent.filter((envelope) => envelope.kind === HTTP_KIND.cancel)).toHaveLength(1);
  });

  test("emits cancel when the abort signal is already aborted", async () => {
    const abort = new AbortController();
    abort.abort();
    const sent: RelayEnvelope[] = [];
    const handle = startHubHttpProxy({
      send: (envelope) => {
        sent.push(envelope);
      },
      requestId: "req-preabort",
      method: "GET",
      path: "/slow",
      headers: [],
      requestBody: null,
      signal: abort.signal,
      idleTimeoutMs: 20_000,
    });
    await expect(handle.response).rejects.toMatchObject({ name: "AbortError" });
    expect(
      sent.some(
        (envelope) => envelope.kind === HTTP_KIND.cancel && envelope.request_id === "req-preabort",
      ),
    ).toBe(true);
  });

  test("uses a null body for 204, 205, and 304 responses", async () => {
    for (const status of [204, 205, 304]) {
      const handle = startHubHttpProxy({
        send: () => undefined,
        requestId: `req-${status}`,
        method: "GET",
        path: "/empty",
        headers: [],
        requestBody: null,
        idleTimeoutMs: 20_000,
      });
      await handle.onEnvelope(
        httpEnvelope({
          kind: HTTP_KIND.responseStart,
          requestId: `req-${status}`,
          body: JSON.stringify({ status, headers: [] }),
        }),
      );
      const response = await handle.response;
      expect(httpStatusNullBody(status)).toBe(true);
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
    }
  });

  test("fulfills a legacy whole-body response kind", async () => {
    const payload = bytesOf(2048, 9);
    const handle = startHubHttpProxy({
      send: () => undefined,
      requestId: "req-legacy",
      method: "GET",
      path: "/",
      headers: [],
      requestBody: null,
      idleTimeoutMs: 20_000,
    });
    await handle.onEnvelope(
      httpEnvelope({
        kind: HTTP_KIND.response,
        requestId: "req-legacy",
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

  test("aborts the response body when error arrives after response_start", async () => {
    const handle = startHubHttpProxy({
      send: () => undefined,
      requestId: "req-mid-error",
      method: "GET",
      path: "/partial",
      headers: [],
      requestBody: null,
      idleTimeoutMs: 20_000,
    });
    await handle.onEnvelope(
      httpEnvelope({
        kind: HTTP_KIND.responseStart,
        requestId: "req-mid-error",
        body: JSON.stringify({
          status: 200,
          headers: [["content-type", "application/octet-stream"]],
        }),
      }),
    );
    const response = await handle.response;
    expect(response.status).toBe(200);
    const body = response.arrayBuffer();
    await handle.onEnvelope(
      httpEnvelope({
        kind: HTTP_KIND.error,
        requestId: "req-mid-error",
        body: JSON.stringify({ status: 502, code: "upstream_body_error" }),
      }),
    );
    await expect(body).rejects.toBeTruthy();
  });

  test("preserves repeated response headers", async () => {
    const handle = startHubHttpProxy({
      send: () => undefined,
      requestId: "req-cookies",
      method: "GET",
      path: "/",
      headers: [],
      requestBody: null,
      idleTimeoutMs: 20_000,
    });
    await handle.onEnvelope(
      httpEnvelope({
        kind: HTTP_KIND.responseStart,
        requestId: "req-cookies",
        body: JSON.stringify({
          status: 204,
          headers: [
            ["set-cookie", "a=1"],
            ["set-cookie", "b=2"],
          ],
        }),
      }),
    );
    const response = await handle.response;
    expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
  });
});

describe("pipeGatewayRequestBody", () => {
  test("rejects when the abort signal is already aborted", async () => {
    const abort = new AbortController();
    abort.abort();
    const writable = new WritableStream<Uint8Array>();
    await expect(
      pipeGatewayRequestBody(
        writable,
        encodeGatewayPrelude({ method: "PUT", path: "/x", headers: [] }),
        null,
        abort.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
