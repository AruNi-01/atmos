import { x25519 } from "@noble/curves/ed25519.js";
import { describe, expect, test } from "bun:test";
import {
  createGatewayFetch,
  decodeB64Url,
  deriveRelayHttpE2eeKey,
  e2eeAad,
  encodeB64Url,
  encodeLengthPrefixed,
  generateX25519KeyPair,
  openRecord,
  parseRelayE2eeOffer,
  readLengthPrefixedRecord,
  RELAY_E2EE_ALG,
  RELAY_E2EE_HEADER,
  RELAY_E2EE_REQUEST_ID_HEADER,
  sealRecord,
} from "./e2ee";

function hex32(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe("relay HTTP E2EE", () => {
  test("parses client_session e2ee offers and ignores junk", () => {
    const pk = encodeB64Url(generateX25519KeyPair().publicKey);
    expect(parseRelayE2eeOffer({ enabled: true, alg: RELAY_E2EE_ALG, static_pk: pk })).toEqual({
      enabled: true,
      alg: RELAY_E2EE_ALG,
      static_pk: pk,
    });
    expect(parseRelayE2eeOffer({ enabled: false })).toBeUndefined();
    expect(parseRelayE2eeOffer({ enabled: true, alg: "aes", static_pk: pk })).toBeUndefined();
    expect(parseRelayE2eeOffer(null)).toBeUndefined();
  });

  test("rfc7748 peers derive the same session key and round-trip with AAD", () => {
    const aliceSk = hex32("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
    const bobSk = hex32("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb");
    const alicePk = x25519.getPublicKey(aliceSk);
    const bobPk = x25519.getPublicKey(bobSk);
    const computer = deriveRelayHttpE2eeKey({
      localSecret: aliceSk,
      peerPublic: bobPk,
      ephPublic: bobPk,
      staticPublic: alicePk,
    });
    const client = deriveRelayHttpE2eeKey({
      localSecret: bobSk,
      peerPublic: alicePk,
      ephPublic: bobPk,
      staticPublic: alicePk,
    });
    expect(computer).toEqual(client);

    const aad = e2eeAad("req-1", 0, "request_chunk");
    const sealed = sealRecord(client, aad, new TextEncoder().encode("hello-e2ee"));
    expect(new TextDecoder().decode(openRecord(computer, aad, sealed))).toBe("hello-e2ee");
    expect(() => openRecord(computer, e2eeAad("req-1", 1, "request_chunk"), sealed)).toThrow(
      "e2ee_open_failed",
    );
    expect(() => openRecord(computer, aad, sealed.subarray(0, 10))).toThrow(
      "e2ee_record_truncated",
    );
  });

  test("createGatewayFetch seals the request and opens a framed response", async () => {
    const computer = generateX25519KeyPair();
    const payload = new Uint8Array(40 * 1024).fill(0x5a);
    const wrapped = createGatewayFetch({
      staticPk: encodeB64Url(computer.publicKey),
      fetch: (async (input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get(RELAY_E2EE_HEADER)).toBe("1");
        const requestId = headers.get(RELAY_E2EE_REQUEST_ID_HEADER);
        expect(requestId).toBeTruthy();
        const ephPk = decodeB64Url(headers.get("X-Atmos-E2EE-Eph-Pk") ?? "");
        const key = deriveRelayHttpE2eeKey({
          localSecret: computer.secretKey,
          peerPublic: ephPk,
          ephPublic: ephPk,
          staticPublic: computer.publicKey,
        });
        const body = new Uint8Array(await new Response(init?.body ?? null).arrayBuffer());
        expect(body.byteLength).toBeGreaterThan(payload.byteLength);
        const records: Uint8Array[] = [];
        let offset = 0;
        while (offset + 4 <= body.byteLength) {
          const n = new DataView(body.buffer, body.byteOffset + offset, 4).getUint32(0);
          offset += 4;
          records.push(body.slice(offset, offset + n));
          offset += n;
        }
        expect(records.length).toBeGreaterThan(1);
        const plain = new Uint8Array(payload.byteLength);
        let at = 0;
        records.forEach((record, seq) => {
          const opened = openRecord(key, e2eeAad(requestId!, seq, "request_chunk"), record);
          plain.set(opened, at);
          at += opened.byteLength;
        });
        expect(plain).toEqual(payload);

        const reply = encodeLengthPrefixed(
          sealRecord(key, e2eeAad(requestId!, 0, "response_chunk"), payload),
        );
        return new Response(reply, {
          status: 200,
          headers: {
            [RELAY_E2EE_HEADER]: "1",
            [RELAY_E2EE_REQUEST_ID_HEADER]: requestId!,
          },
        });
      }) as typeof fetch,
    });

    const response = await wrapped("https://relay.example/v1/computers/s/proxy/echo", {
      method: "PUT",
      body: payload,
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload);
  });

  test("createGatewayFetch fails closed on a 2xx plaintext response", async () => {
    const computer = generateX25519KeyPair();
    const wrapped = createGatewayFetch({
      staticPk: computer.publicKey,
      fetch: (async () => new Response("ok", { status: 200 })) as typeof fetch,
    });
    await expect(wrapped("https://relay.example/v1/computers/s/proxy/x")).rejects.toMatchObject({
      message: "e2ee_missing_on_response",
    });
  });

  test("readLengthPrefixedRecord rejects a truncated frame", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const buf = new Uint8Array(6);
        new DataView(buf.buffer).setUint32(0, 32);
        buf.set([1, 2], 4);
        controller.enqueue(buf);
        controller.close();
      },
    });
    const leftover = { buf: new Uint8Array(0) };
    await expect(readLengthPrefixedRecord(stream.getReader(), leftover)).rejects.toMatchObject({
      message: "e2ee_truncated_record",
    });
  });

  test("createGatewayFetch keeps Worker error JSON readable", async () => {
    const computer = generateX25519KeyPair();
    const wrapped = createGatewayFetch({
      staticPk: computer.publicKey,
      fetch: (async () =>
        new Response(JSON.stringify({ error: "server_offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    });
    const response = await wrapped("https://relay.example/v1/computers/s/proxy/x");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "server_offline" });
  });
});
