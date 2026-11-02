/** APP-016: HTTP gateway auth + path helpers (edge → ServerHub → Computer WS). */

import type { Env } from "./index";
import type { GatewayE2ee } from "./http-stream";
import { isValidE2eeRequestId } from "./http-stream";

const GATEWAY_PATH_RE = /^\/v1\/computers\/([^/]+)\/proxy(\/.*)?$/;
const RELAY_SECRET_HEADER = "X-Atmos-Relay-Secret";

export type GatewayRoute = {
  serverId: string;
  upstreamPath: string;
};

export function matchGatewayPath(pathname: string): GatewayRoute | null {
  const m = GATEWAY_PATH_RE.exec(pathname);
  if (!m) {
    return null;
  }
  const serverId = m[1]!;
  const suffix = m[2] ?? "";
  const upstreamPath = suffix.length > 0 ? suffix : "/";
  return { serverId, upstreamPath };
}

export function gatewayBaseUrl(relayOrigin: string, serverId: string): string {
  const base = relayOrigin.replace(/\/$/, "");
  return `${base}/v1/computers/${encodeURIComponent(serverId)}/proxy`;
}

export async function validateGatewayAccess(
  request: Request,
  env: Env,
  serverId: string,
  secretHash: (secret: string) => Promise<string>,
  userIdFromBearer: (request: Request, env: Env) => Promise<string | null>,
): Promise<boolean> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return false;
  }
  const token = auth.slice("Bearer ".length).trim();
  if (token.length < 32) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenHash = await secretHash(token);

  const session = await env.DB.prepare(
    `SELECT 1 AS ok FROM client_sessions
     WHERE token_hash = ? AND server_id = ? AND expires_at > ? LIMIT 1`,
  )
    .bind(tokenHash, serverId, now)
    .first<{ ok: number }>();

  if (session) {
    return true;
  }

  const relaySecret = env.RELAY_SECRET_KEY?.trim();
  if (relaySecret) {
    const providedSecret = request.headers.get(RELAY_SECRET_HEADER)?.trim() ?? "";
    if (!providedSecret) {
      return false;
    }
    const [relaySecretHash, providedSecretHash] = await Promise.all([
      secretHash(relaySecret),
      secretHash(providedSecret),
    ]);
    if (relaySecretHash !== providedSecretHash) {
      return false;
    }
  }

  const userId = await userIdFromBearer(request, env);
  if (!userId) {
    return false;
  }

  const comp = await env.DB.prepare(
    `SELECT 1 AS ok FROM computers
     WHERE server_id = ? AND user_id = ? AND revoked = 0 LIMIT 1`,
  )
    .bind(serverId, userId)
    .first<{ ok: number }>();

  return !!comp;
}

/** Headers we forward to the upstream Atmos API (hop-by-hop stripped). */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

const E2EE_HOP = new Set([
  "x-atmos-e2ee",
  "x-atmos-e2ee-alg",
  "x-atmos-e2ee-request-id",
  "x-atmos-e2ee-eph-pk",
]);

export function collectForwardHeaders(request: Request): [string, string][] {
  const out: [string, string][] = [];
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || E2EE_HOP.has(lower)) {
      return;
    }
    if (lower === "cf-connecting-ip" || lower.startsWith("cf-")) {
      return;
    }
    out.push([key, value]);
  });
  return out;
}

export function parseGatewayE2ee(request: Request): GatewayE2ee | null | "invalid" {
  const flag = request.headers.get("X-Atmos-E2EE")?.trim();
  if (!flag || flag === "0") {
    return null;
  }
  const alg = request.headers.get("X-Atmos-E2EE-Alg")?.trim() ?? "";
  const requestId = request.headers.get("X-Atmos-E2EE-Request-Id")?.trim() ?? "";
  const ephPk = request.headers.get("X-Atmos-E2EE-Eph-Pk")?.trim() ?? "";
  if (alg !== "x25519-chacha20poly1305" || !isValidE2eeRequestId(requestId) || ephPk.length < 42) {
    return "invalid";
  }
  return {
    v: 1,
    alg,
    request_id: requestId,
    eph_pk: ephPk,
  };
}
