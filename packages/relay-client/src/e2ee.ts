/**
 * Relay HTTP gateway E2EE (X25519 + ChaCha20-Poly1305).
 *
 * Routing envelope fields stay plaintext. Only HTTP chunk bodies are sealed.
 * Keying is orthogonal to register_token / server_secret / client_token.
 * The Computer static public key arrives via client_session (Hub/Relay delivery).
 */

import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { RelayE2eeOffer } from "./types";

export const RELAY_E2EE_ALG = "x25519-chacha20poly1305";
export const RELAY_E2EE_VERSION = 1;
export const RELAY_E2EE_HKDF_INFO = "atmos-relay-http-e2ee-v1";
export const RELAY_E2EE_HEADER = "X-Atmos-E2EE";
export const RELAY_E2EE_ALG_HEADER = "X-Atmos-E2EE-Alg";
export const RELAY_E2EE_REQUEST_ID_HEADER = "X-Atmos-E2EE-Request-Id";
export const RELAY_E2EE_EPH_PK_HEADER = "X-Atmos-E2EE-Eph-Pk";

const KEY_LEN = 32;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const CHUNK_SIZE = 32 * 1024;
const MAX_SEALED_RECORD = 64 * 1024;

export type { RelayE2eeOffer };

export type RelayE2eeSessionBlock =
  | RelayE2eeOffer
  | {
      enabled: false;
    };

export function parseRelayE2eeOffer(raw: unknown): RelayE2eeOffer | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const value = raw as {
    enabled?: unknown;
    alg?: unknown;
    static_pk?: unknown;
  };
  if (value.enabled === false) {
    return undefined;
  }
  if (value.alg !== RELAY_E2EE_ALG || typeof value.static_pk !== "string") {
    return undefined;
  }
  try {
    const pk = decodeB64Url(value.static_pk);
    if (pk.byteLength !== KEY_LEN) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return {
    enabled: true,
    alg: RELAY_E2EE_ALG,
    static_pk: value.static_pk,
  };
}

export function e2eeAad(
  requestId: string,
  seq: number,
  kind: "request_chunk" | "response_chunk",
): Uint8Array {
  return new TextEncoder().encode(`${requestId}|${seq}|${kind}`);
}

export function generateX25519KeyPair(): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const pair = x25519.keygen();
  return { secretKey: pair.secretKey, publicKey: pair.publicKey };
}

export function deriveRelayHttpE2eeKey(opts: {
  localSecret: Uint8Array;
  peerPublic: Uint8Array;
  ephPublic: Uint8Array;
  staticPublic: Uint8Array;
}): Uint8Array {
  const shared = x25519.getSharedSecret(opts.localSecret, opts.peerPublic);
  const salt = new Uint8Array(opts.ephPublic.length + opts.staticPublic.length);
  salt.set(opts.ephPublic, 0);
  salt.set(opts.staticPublic, opts.ephPublic.length);
  return hkdf(sha256, shared, salt, new TextEncoder().encode(RELAY_E2EE_HKDF_INFO), KEY_LEN);
}

export function sealRecord(key: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE_LEN);
  const ciphertext = chacha20poly1305(key, nonce, aad).encrypt(plaintext);
  const out = new Uint8Array(NONCE_LEN + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, NONCE_LEN);
  return out;
}

export function openRecord(key: Uint8Array, aad: Uint8Array, record: Uint8Array): Uint8Array {
  if (record.byteLength < NONCE_LEN + TAG_LEN) {
    throw new Error("e2ee_record_truncated");
  }
  const nonce = record.subarray(0, NONCE_LEN);
  const ciphertext = record.subarray(NONCE_LEN);
  try {
    return chacha20poly1305(key, nonce, aad).decrypt(ciphertext);
  } catch {
    throw new Error("e2ee_open_failed");
  }
}

export function encodeLengthPrefixed(record: Uint8Array): Uint8Array {
  if (record.byteLength > MAX_SEALED_RECORD) {
    throw new Error("e2ee_record_too_large");
  }
  const out = new Uint8Array(4 + record.byteLength);
  new DataView(out.buffer).setUint32(0, record.byteLength);
  out.set(record, 4);
  return out;
}

export async function readLengthPrefixedRecord(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  leftover: { buf: Uint8Array },
): Promise<Uint8Array | null> {
  const lenBytes = await readExact(reader, leftover, 4);
  if (!lenBytes) {
    return null;
  }
  const n = new DataView(lenBytes.buffer, lenBytes.byteOffset, lenBytes.byteLength).getUint32(0);
  if (n < NONCE_LEN + TAG_LEN || n > MAX_SEALED_RECORD) {
    throw new Error("e2ee_invalid_record_length");
  }
  const record = await readExact(reader, leftover, n);
  if (!record) {
    throw new Error("e2ee_truncated_record");
  }
  return record;
}

export type CreateGatewayFetchOptions = {
  staticPk: string | Uint8Array;
  fetch?: typeof fetch;
  enabled?: boolean;
};

/**
 * Wrap `fetch` so gateway HTTP bodies are sealed before they reach Relay.
 * Encrypts only when `enabled` is not false. Each call uses a fresh client ephemeral.
 */
export function createGatewayFetch(opts: CreateGatewayFetchOptions): typeof fetch {
  const inner = opts.fetch ?? globalThis.fetch.bind(globalThis);
  if (opts.enabled === false) {
    return inner;
  }
  const staticPk = typeof opts.staticPk === "string" ? decodeB64Url(opts.staticPk) : opts.staticPk;
  if (staticPk.byteLength !== KEY_LEN) {
    throw new Error("e2ee_invalid_static_pk");
  }

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const requestId = crypto.randomUUID();
    const eph = generateX25519KeyPair();
    const key = deriveRelayHttpE2eeKey({
      localSecret: eph.secretKey,
      peerPublic: staticPk,
      ephPublic: eph.publicKey,
      staticPublic: staticPk,
    });

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set(RELAY_E2EE_HEADER, "1");
    headers.set(RELAY_E2EE_ALG_HEADER, RELAY_E2EE_ALG);
    headers.set(RELAY_E2EE_REQUEST_ID_HEADER, requestId);
    headers.set(RELAY_E2EE_EPH_PK_HEADER, encodeB64Url(eph.publicKey));
    headers.delete("content-length");

    const plainBody = await requestBodyStream(input, init, method);
    const sealedBody =
      plainBody === null
        ? null
        : sealBodyStream(
            plainBody,
            key,
            requestId,
            init?.signal ?? (input instanceof Request ? input.signal : null),
          );

    const nextInit: RequestInit & { duplex?: "half" } = {
      ...init,
      method,
      headers,
      body: sealedBody ?? undefined,
    };
    if (sealedBody) {
      nextInit.duplex = "half";
    }

    const response = await inner(input, nextInit);
    if (response.headers.get(RELAY_E2EE_HEADER) !== "1") {
      if (response.ok) {
        // Client offered encryption; a 2xx plaintext body is a downgrade.
        throw new Error("e2ee_missing_on_response");
      }
      return response;
    }
    if (
      !response.body ||
      response.status === 204 ||
      response.status === 205 ||
      response.status === 304
    ) {
      return response;
    }
    const opened = openBodyStream(response.body, key, requestId);
    return new Response(opened, {
      status: response.status,
      statusText: response.statusText,
      headers: stripHopLength(response.headers),
    });
  }) as typeof fetch;
}

function stripHopLength(headers: Headers): Headers {
  const next = new Headers(headers);
  next.delete("content-length");
  next.delete("transfer-encoding");
  return next;
}

function sealBodyStream(
  body: ReadableStream<Uint8Array>,
  key: Uint8Array,
  requestId: string,
  signal?: AbortSignal | null,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let leftover = new Uint8Array(0);
  let seq = 0;
  let done = false;
  return new ReadableStream({
    async pull(controller) {
      if (signal?.aborted) {
        controller.error(signal.reason ?? new DOMException("Aborted", "AbortError"));
        return;
      }
      while (!done && leftover.byteLength < CHUNK_SIZE) {
        const step = await reader.read();
        if (step.done) {
          done = true;
          break;
        }
        if (!step.value || step.value.byteLength === 0) {
          continue;
        }
        const merged = new Uint8Array(leftover.byteLength + step.value.byteLength);
        merged.set(leftover);
        merged.set(step.value, leftover.byteLength);
        leftover = merged;
      }
      if (leftover.byteLength === 0) {
        controller.close();
        return;
      }
      const take = Math.min(CHUNK_SIZE, leftover.byteLength);
      const piece = leftover.subarray(0, take);
      leftover = leftover.subarray(take);
      const sealed = sealRecord(key, e2eeAad(requestId, seq, "request_chunk"), piece);
      seq += 1;
      controller.enqueue(encodeLengthPrefixed(sealed));
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function openBodyStream(
  body: ReadableStream<Uint8Array>,
  key: Uint8Array,
  requestId: string,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const leftover = { buf: new Uint8Array(0) };
  let seq = 0;
  return new ReadableStream({
    async pull(controller) {
      const record = await readLengthPrefixedRecord(reader, leftover);
      if (!record) {
        controller.close();
        return;
      }
      const plain = openRecord(key, e2eeAad(requestId, seq, "response_chunk"), record);
      seq += 1;
      if (plain.byteLength > 0) {
        controller.enqueue(plain);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

async function requestBodyStream(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  method: string,
): Promise<ReadableStream<Uint8Array> | null> {
  if (method === "GET" || method === "HEAD") {
    return null;
  }
  const body = init?.body ?? (input instanceof Request ? input.body : null);
  if (body == null) {
    return null;
  }
  if (body instanceof ReadableStream) {
    return body as ReadableStream<Uint8Array>;
  }
  if (body instanceof Uint8Array) {
    return readableOf(body);
  }
  if (body instanceof ArrayBuffer) {
    return readableOf(new Uint8Array(body));
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return body.stream();
  }
  const request = new Request("https://atmos.invalid/e2ee", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return request.body;
}

function readableOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (bytes.byteLength > 0) {
        controller.enqueue(bytes);
      }
      controller.close();
    },
  });
}

async function readExact(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  leftover: { buf: Uint8Array },
  n: number,
): Promise<Uint8Array | null> {
  while (leftover.buf.byteLength < n) {
    const { done, value } = await reader.read();
    if (done) {
      if (leftover.buf.byteLength === 0) {
        return null;
      }
      throw new Error("e2ee_truncated_record");
    }
    if (!value || value.byteLength === 0) {
      continue;
    }
    const next = new Uint8Array(leftover.buf.byteLength + value.byteLength);
    next.set(leftover.buf);
    next.set(value, leftover.buf.byteLength);
    leftover.buf = next;
  }
  const out = leftover.buf.slice(0, n);
  leftover.buf = leftover.buf.slice(n);
  return out;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function encodeB64Url(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x2000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeB64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
