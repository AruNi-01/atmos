/**
 * Relay hop E2EE (X25519 + ChaCha20-Poly1305).
 *
 * Routing envelope fields stay plaintext. HTTP chunk bodies and app/terminal
 * `kind:frame` bodies are sealed when both ends support and enable it.
 * Keying is orthogonal to register_token / server_secret / client_token.
 * The Computer static public key arrives via client_session (Hub-mediated TOFU).
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
export const RELAY_E2EE_WS_FLAG = "e2ee";
export const RELAY_E2EE_WS_ALG = "e2ee_alg";
export const RELAY_E2EE_WS_EPH = "eph_pk";

const KEY_LEN = 32;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const CHUNK_SIZE = 32 * 1024;
const MAX_SEALED_RECORD = 64 * 1024;

const GATEWAY_ERROR_CODES = new Set([
  "server_offline",
  "invalid_e2ee",
  "e2ee_unavailable",
  "duplicate_request_id",
  "unauthorized",
  "client_disconnected",
  "gateway_timeout",
  "gateway_error",
  "invalid_gateway_descriptor",
]);

export type { RelayE2eeOffer };

export type RelayE2eeSessionBlock =
  | RelayE2eeOffer
  | {
      enabled: false;
    };

export type RelayFrameStream = "app" | "terminal";
export type RelayHttpAadKind = "request_chunk" | "request_end" | "response_chunk" | "response_end";
export type RelayFrameAadKind = "frame_c2s" | "frame_s2c";

export function parseRelayE2eeOffer(raw: unknown): RelayE2eeOffer | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const value = raw as {
    enabled?: unknown;
    alg?: unknown;
    static_pk?: unknown;
  };
  if (value.enabled !== true) {
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

export function e2eeAad(requestId: string, seq: number, kind: RelayHttpAadKind): Uint8Array {
  return new TextEncoder().encode(`${requestId}|${seq}|${kind}`);
}

export function frameAad(
  ephPk: string,
  stream: RelayFrameStream,
  seq: number,
  kind: RelayFrameAadKind,
): Uint8Array {
  return new TextEncoder().encode(`${ephPk}|${stream}|${seq}|${kind}`);
}

export function relayE2eeCsprngAvailable(): boolean {
  return typeof globalThis.crypto?.getRandomValues === "function";
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
  let shared: Uint8Array;
  try {
    shared = x25519.getSharedSecret(opts.localSecret, opts.peerPublic);
  } catch {
    throw new Error("e2ee_non_contributory");
  }
  if (shared.every((byte) => byte === 0)) {
    throw new Error("e2ee_non_contributory");
  }
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

/** Test-only: pin a sealed record against a known-answer nonce. */
export function sealRecordWithNonce(
  key: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  if (nonce.byteLength !== NONCE_LEN) {
    throw new Error("e2ee_invalid_nonce");
  }
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
    if (leftover.buf.byteLength > 0) {
      throw new Error("e2ee_truncated_record");
    }
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

export function openHttpRequestRecord(
  key: Uint8Array,
  requestId: string,
  seq: number,
  record: Uint8Array,
): { plain: Uint8Array; final: boolean } {
  try {
    return {
      plain: openRecord(key, e2eeAad(requestId, seq, "request_chunk"), record),
      final: false,
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "e2ee_open_failed") {
      throw error;
    }
    const plain = openRecord(key, e2eeAad(requestId, seq, "request_end"), record);
    if (plain.byteLength !== 0) {
      throw new Error("e2ee_open_failed");
    }
    return { plain, final: true };
  }
}

export function openHttpResponseRecord(
  key: Uint8Array,
  requestId: string,
  seq: number,
  record: Uint8Array,
): { plain: Uint8Array; final: boolean } {
  try {
    return {
      plain: openRecord(key, e2eeAad(requestId, seq, "response_chunk"), record),
      final: false,
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "e2ee_open_failed") {
      throw error;
    }
    openRecord(key, e2eeAad(requestId, seq, "response_end"), record);
    return { plain: new Uint8Array(0), final: true };
  }
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
    const requestId = randomRequestId();
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

    const plainBody = await requestBodyStream(input, init, method, headers);
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
        throw new Error("e2ee_missing_on_response");
      }
      if (await isRecognizedGatewayError(response.clone())) {
        return response;
      }
      throw new Error("e2ee_plaintext_error");
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

export class RelayFrameCodec {
  private upSeq = 0;
  private downSeq = 0;

  constructor(
    private readonly key: Uint8Array,
    private readonly stream: RelayFrameStream,
    private readonly ephPk: string,
  ) {}

  sealUp(plaintext: string): string {
    const seq = this.upSeq;
    this.upSeq += 1;
    const record = sealRecord(
      this.key,
      frameAad(this.ephPk, this.stream, seq, "frame_c2s"),
      new TextEncoder().encode(plaintext),
    );
    return encodeB64Std(record);
  }

  openDown(sealed: string): string {
    const record = decodeB64Std(sealed);
    const seq = this.downSeq;
    const plain = openRecord(this.key, frameAad(this.ephPk, this.stream, seq, "frame_s2c"), record);
    this.downSeq += 1;
    return new TextDecoder().decode(plain);
  }
}

export function isRelayFrameSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.endsWith("/ws/client") || parsed.pathname.endsWith("/ws/terminal");
  } catch {
    return false;
  }
}

export function prepareRelayFrameSocket(
  url: string,
  offer: RelayE2eeOffer | null | undefined,
  stream: RelayFrameStream,
): { url: string; codec: RelayFrameCodec | null } {
  if (!offer?.enabled || !offer.static_pk || !isRelayFrameSocketUrl(url)) {
    return { url, codec: null };
  }
  if (!relayE2eeCsprngAvailable()) {
    return { url, codec: null };
  }
  const staticPk = decodeB64Url(offer.static_pk);
  if (staticPk.byteLength !== KEY_LEN) {
    return { url, codec: null };
  }
  const eph = generateX25519KeyPair();
  const key = deriveRelayHttpE2eeKey({
    localSecret: eph.secretKey,
    peerPublic: staticPk,
    ephPublic: eph.publicKey,
    staticPublic: staticPk,
  });
  const ephPk = encodeB64Url(eph.publicKey);
  const next = new URL(url);
  next.searchParams.set(RELAY_E2EE_WS_FLAG, "1");
  next.searchParams.set(RELAY_E2EE_WS_ALG, RELAY_E2EE_ALG);
  next.searchParams.set(RELAY_E2EE_WS_EPH, ephPk);
  return { url: next.toString(), codec: new RelayFrameCodec(key, stream, ephPk) };
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
  const parts: Uint8Array[] = [];
  let buffered = 0;
  let seq = 0;
  let done = false;
  return new ReadableStream({
    async pull(controller) {
      if (signal?.aborted) {
        controller.error(signal.reason ?? new DOMException("Aborted", "AbortError"));
        return;
      }
      while (!done && buffered < CHUNK_SIZE) {
        const step = await reader.read();
        if (step.done) {
          done = true;
          break;
        }
        if (!step.value || step.value.byteLength === 0) {
          continue;
        }
        parts.push(step.value);
        buffered += step.value.byteLength;
      }
      if (buffered === 0) {
        if (done && seq > 0) {
          const sealed = sealRecord(key, e2eeAad(requestId, seq, "request_end"), new Uint8Array(0));
          seq += 1;
          controller.enqueue(encodeLengthPrefixed(sealed));
        }
        controller.close();
        return;
      }
      const leftover = concatBytes(parts);
      parts.length = 0;
      const take = Math.min(CHUNK_SIZE, leftover.byteLength);
      const piece = leftover.subarray(0, take);
      const rest = leftover.subarray(take);
      if (rest.byteLength > 0) {
        parts.push(rest);
      }
      buffered = rest.byteLength;
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
  let sawEnd = false;
  return new ReadableStream({
    async pull(controller) {
      if (sawEnd) {
        controller.close();
        return;
      }
      const record = await readLengthPrefixedRecord(reader, leftover);
      if (!record) {
        controller.error(new Error("e2ee_truncated_stream"));
        return;
      }
      const opened = openHttpResponseRecord(key, requestId, seq, record);
      seq += 1;
      if (opened.final) {
        sawEnd = true;
        if (leftover.buf.byteLength > 0) {
          controller.error(new Error("e2ee_truncated_stream"));
          return;
        }
        controller.close();
        return;
      }
      if (opened.plain.byteLength > 0) {
        controller.enqueue(opened.plain);
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
  headers: Headers,
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
    if (body.type && !headers.has("Content-Type")) {
      headers.set("Content-Type", body.type);
    }
    return body.stream();
  }
  const request = new Request("https://atmos.invalid/e2ee", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!headers.has("Content-Type")) {
    const generated = request.headers.get("Content-Type");
    if (generated) {
      headers.set("Content-Type", generated);
    }
  }
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
  const parts: Uint8Array[] = leftover.buf.byteLength > 0 ? [leftover.buf] : [];
  let have = leftover.buf.byteLength;
  leftover.buf = new Uint8Array(0);
  while (have < n) {
    const { done, value } = await reader.read();
    if (done) {
      if (have === 0) {
        return null;
      }
      leftover.buf = concatBytes(parts);
      throw new Error("e2ee_truncated_record");
    }
    if (!value || value.byteLength === 0) {
      continue;
    }
    parts.push(value);
    have += value.byteLength;
  }
  const merged = parts.length === 1 ? parts[0]! : concatBytes(parts);
  leftover.buf = merged.slice(n);
  return merged.slice(0, n);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function randomRequestId(): string {
  const bytes = randomBytes(16);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function randomBytes(n: number): Uint8Array {
  if (!relayE2eeCsprngAvailable()) {
    throw new Error("e2ee_csprng_unavailable");
  }
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

async function isRecognizedGatewayError(response: Response): Promise<boolean> {
  if (response.ok) {
    return false;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return false;
  }
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" && GATEWAY_ERROR_CODES.has(payload.error);
  } catch {
    return false;
  }
}

export function encodeB64Url(bytes: Uint8Array): string {
  return encodeB64Std(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeB64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return decodeB64Std(padded + pad);
}

export function encodeB64Std(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x2000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function decodeB64Std(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function isValidEphPk(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
