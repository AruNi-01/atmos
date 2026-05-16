/** APP-016: HTTP gateway auth + path helpers (Worker → DO → Server outbound WS). */

import type { Env } from "./index";

const GATEWAY_PATH_RE = /^\/v1\/computers\/([^/]+)\/proxy(\/.*)?$/;

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

export function gatewayBaseUrl(controlPlaneOrigin: string, serverId: string): string {
  const base = controlPlaneOrigin.replace(/\/$/, "");
  return `${base}/v1/computers/${encodeURIComponent(serverId)}/proxy`;
}

export async function validateGatewayAccess(
  request: Request,
  env: Env,
  serverId: string,
  secretHash: (secret: string) => Promise<string>,
  tenantFromBearer: (request: Request, env: Env) => Promise<string | null>,
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

  const tenant = await tenantFromBearer(request, env);
  if (!tenant) {
    return false;
  }

  const comp = await env.DB.prepare(
    `SELECT 1 AS ok FROM computers
     WHERE server_id = ? AND tenant_id = ? AND revoked = 0 LIMIT 1`,
  )
    .bind(serverId, tenant)
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

export function collectForwardHeaders(request: Request): [string, string][] {
  const out: [string, string][] = [];
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) {
      return;
    }
    if (lower === "cf-connecting-ip" || lower.startsWith("cf-")) {
      return;
    }
    out.push([key, value]);
  });
  return out;
}
