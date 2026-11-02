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
    await Promise.resolve();
    expect(released).toBe(false);
    window.ack(1);
    await expect(third).resolves.toBe(2);
    expect(released).toBe(true);
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
    expect(sent.some((envelope) => envelope.kind === HTTP_KIND.cancel)).toBe(true);
  });
});
