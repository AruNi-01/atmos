/** APP-016: Worker — control-plane REST + WebSocket handshake to ServerHub DO. */

import { ServerHub } from "./server-hub";

export interface Env {
  SERVER_HUB: DurableObjectNamespace<ServerHub>;
  DB: D1Database;
}

const REGISTER_TOKEN_TTL_SEC = 15 * 60;
const CLIENT_TOKEN_TTL_SEC = 24 * 3600;
const REGISTER_RATE_LIMIT = 30;
const TENANT_CREATE_RATE_LIMIT = 10;
const RATE_WINDOW_SEC = 60;
/** Minimum access token length (characters). */
const MIN_ACCESS_TOKEN_LEN = 32;

/** Per-isolate IP rate limits (M1). */
const registerRateByIp = new Map<string, { count: number; windowStart: number }>();
const tenantCreateRateByIp = new Map<string, { count: number; windowStart: number }>();

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const path = normalizedPath(url.pathname);

    if (
      path === "/ws/server" ||
      path === "/v1/server" ||
      path === "/v1/machine/server"
    ) {
      const res = await handleServerWebSocket(request, env, url);
      return withCorsWs(res);
    }

    if (
      path === "/ws/client" ||
      path === "/v1/client" ||
      path === "/v1/machine/client"
    ) {
      const res = await handleClientWebSocket(request, env, url);
      return withCorsWs(res);
    }

    return withCors(await handleApi(request, env, url));
  },
};

export { ServerHub };

function normalizedPath(pathname: string): string {
  if (pathname.startsWith("/api/v1/machine")) {
    return pathname.slice("/api".length);
  }
  if (pathname.startsWith("/api/v1")) {
    return pathname.slice("/api".length);
  }
  return pathname;
}

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return new Response(res.body, { status: res.status, headers: h });
}

function withCorsWs(res: Response): Response {
  if (res.webSocket || res.headers.get("Upgrade")) {
    return res;
  }
  return withCors(res);
}

function parseBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  const token = auth.slice("Bearer ".length).trim();
  if (token.length < MIN_ACCESS_TOKEN_LEN) {
    return null;
  }
  return token;
}

/** Returns `tenant_id` (= sha256 hex of the user's access token) when registered. */
async function tenantFromRequest(
  request: Request,
  env: Env,
): Promise<string | null> {
  const token = parseBearerToken(request);
  if (!token) {
    return null;
  }
  const hash = await secretHash(token);
  const row = await env.DB.prepare(
    "SELECT token_hash FROM tenants WHERE token_hash = ? LIMIT 1",
  )
    .bind(hash)
    .first<{ token_hash: string }>();

  return row ? hash : null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function secretHash(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomBase64Url(byteLength: number): string {
  const raw = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const b of raw) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function randomUuidLike(): Promise<string> {
  const hex = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function httpOrigin(url: URL): string {
  const originProto = url.protocol.startsWith("https") ? "https:" : "http:";
  const host = url.host || "localhost";
  return `${originProto}//${host}`;
}

function wsOrigin(http: string): string {
  return http.replace(/^http/, "ws");
}

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function checkRateLimit(
  ip: string,
  map: Map<string, { count: number; windowStart: number }>,
  limit: number,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  let entry = map.get(ip);
  if (!entry || now - entry.windowStart >= RATE_WINDOW_SEC) {
    entry = { count: 0, windowStart: now };
    map.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= limit;
}

async function handleApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const tenant = await tenantFromRequest(request, env);
  const path = normalizedPath(url.pathname);

  try {
    if (path === "/healthz" && request.method === "GET") {
      return json({ ok: true });
    }

    if (path === "/v1/tenants" && request.method === "POST") {
      const ip = clientIp(request);
      if (!checkRateLimit(ip, tenantCreateRateByIp, TENANT_CREATE_RATE_LIMIT)) {
        return json({ error: "rate_limited" }, 429);
      }

      const body = (await request.json().catch(() => null)) as {
        token?: string;
      } | null;
      const accessToken = body?.token?.trim() ?? "";
      if (accessToken.length < MIN_ACCESS_TOKEN_LEN) {
        return json({ error: "invalid_access_token" }, 400);
      }

      const now = Math.floor(Date.now() / 1000);
      const tokenHash = await secretHash(accessToken);

      const existing = await env.DB.prepare(
        "SELECT token_hash FROM tenants WHERE token_hash = ? LIMIT 1",
      )
        .bind(tokenHash)
        .first();

      if (existing) {
        return json({ error: "tenant_exists" }, 409);
      }

      await env.DB.prepare(
        "INSERT INTO tenants(token_hash, created_at) VALUES (?, ?)",
      )
        .bind(tokenHash, now)
        .run();

      return json({ ok: true }, 201);
    }

    if (path === "/v1/register_tokens" && request.method === "POST") {
      if (!tenant) {
        return json({ error: "unauthorized" }, 401);
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + REGISTER_TOKEN_TTL_SEC;
      const registerToken = randomBase64Url(32);
      const tokenHash = await secretHash(registerToken);

      await env.DB.prepare(
        `INSERT INTO register_tokens(token_hash, tenant_id, expires_at, used_at, created_at)
         VALUES (?, ?, ?, NULL, ?)`,
      )
        .bind(tokenHash, tenant, expiresAt, now)
        .run();

      const cp = httpOrigin(url);
      const registerCommand = `atmos computer register --control-plane ${cp} --token ${registerToken}`;

      return json({
        register_token: registerToken,
        expires_at: expiresAt,
        register_command: registerCommand,
      });
    }

    if (path === "/v1/computers/register" && request.method === "POST") {
      const ip = clientIp(request);
      if (!checkRateLimit(ip, registerRateByIp, REGISTER_RATE_LIMIT)) {
        return json({ error: "rate_limited" }, 429);
      }

      const body = (await request.json().catch(() => null)) as {
        register_token?: string;
        display_name?: string;
      } | null;

      const registerToken = body?.register_token?.trim();
      if (!registerToken) {
        return json({ error: "invalid_register_token" }, 400);
      }

      const now = Math.floor(Date.now() / 1000);
      const tokenHash = await secretHash(registerToken);

      const row = await env.DB.prepare(
        `SELECT tenant_id FROM register_tokens
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
      )
        .bind(tokenHash, now)
        .first<{ tenant_id: string }>();

      if (!row) {
        return json({ error: "invalid_register_token" }, 400);
      }

      const used = await env.DB.prepare(
        `UPDATE register_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL`,
      )
        .bind(now, tokenHash)
        .run();

      if (!used.meta.changes) {
        return json({ error: "register_token_expired" }, 400);
      }

      const serverSecret = randomBase64Url(32);
      const serverId = await randomUuidLike();
      const displayName =
        body?.display_name?.trim() ||
        `Computer ${serverId.slice(0, 8)}`;

      await env.DB.prepare(
        `INSERT INTO computers(server_id, tenant_id, secret_hash, revoked, display_name, created_at, last_seen_at)
         VALUES (?, ?, ?, 0, ?, ?, NULL)`,
      )
        .bind(
          serverId,
          row.tenant_id,
          await secretHash(serverSecret),
          displayName,
          now,
        )
        .run();

      const cp = httpOrigin(url);
      const relayWs = `${wsOrigin(cp)}/ws/server`;

      return json({
        server_id: serverId,
        server_secret: serverSecret,
        relay_ws_url: relayWs,
        control_plane_url: cp,
        display_name: displayName,
      });
    }

    if (path === "/v1/computers" && request.method === "GET") {
      if (!tenant) {
        return json({ error: "unauthorized" }, 401);
      }

      const { results } = await env.DB.prepare(
        `SELECT server_id, display_name, revoked, created_at, last_seen_at
         FROM computers WHERE tenant_id = ? ORDER BY created_at DESC`,
      )
        .bind(tenant)
        .all<{
          server_id: string;
          display_name: string | null;
          revoked: number;
          created_at: number;
          last_seen_at: number | null;
        }>();

      const computers = (results ?? []).map((c) => ({
        ...c,
        online: c.last_seen_at != null,
      }));

      return json({ computers });
    }

    const revokeMatch = path.match(/^\/v1\/computers\/([^/]+)\/revoke$/);
    if (revokeMatch && request.method === "POST") {
      if (!tenant) {
        return json({ error: "unauthorized" }, 401);
      }

      const serverId = revokeMatch[1]!;

      await env.DB.prepare(
        "UPDATE computers SET revoked = 1 WHERE server_id = ? AND tenant_id = ?",
      )
        .bind(serverId, tenant)
        .run();

      await env.DB.prepare(
        "DELETE FROM client_sessions WHERE server_id = ? AND tenant_id = ?",
      )
        .bind(serverId, tenant)
        .run();

      return json({ ok: true });
    }

    const sessionMatch = path.match(/^\/v1\/computers\/([^/]+)\/client_sessions$/);
    if (sessionMatch && request.method === "POST") {
      if (!tenant) {
        return json({ error: "unauthorized" }, 401);
      }

      const serverId = sessionMatch[1]!;
      const body = (await request.json().catch(() => ({}))) as {
        client_kind?: string;
      };
      const clientKind = body.client_kind?.trim() || "web";

      const c = await env.DB.prepare(
        "SELECT revoked FROM computers WHERE server_id = ? AND tenant_id = ?",
      )
        .bind(serverId, tenant)
        .first<{ revoked: number }>();

      if (!c || c.revoked) {
        return json({ error: "computer_revoked" }, 404);
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + CLIENT_TOKEN_TTL_SEC;
      const clientToken = randomBase64Url(32);
      const tokenHash = await secretHash(clientToken);

      await env.DB.prepare(
        "DELETE FROM client_sessions WHERE server_id = ? AND tenant_id = ?",
      )
        .bind(serverId, tenant)
        .run();

      await env.DB.prepare(
        `INSERT INTO client_sessions(token_hash, server_id, tenant_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(tokenHash, serverId, tenant, expiresAt, now)
        .run();

      const cp = httpOrigin(url);
      const wsUrl = `${wsOrigin(cp)}/ws/client?server_id=${encodeURIComponent(
        serverId,
      )}&token=${encodeURIComponent(clientToken)}&client_type=${encodeURIComponent(
        clientKind,
      )}`;

      return json({
        client_token: clientToken,
        expires_at: expiresAt,
        ws_url: wsUrl,
      });
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  return json({ error: "not_found", path }, 404);
}

async function handleServerWebSocket(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket Upgrade", { status: 426 });
  }

  const serverId = url.searchParams.get("server_id");
  const bearer =
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  if (!serverId || !bearer) {
    return json({ error: "missing_server_credentials" }, 401);
  }

  if (url.searchParams.has("server_secret")) {
    return json({ error: "server_secret_in_query_forbidden" }, 400);
  }

  const hash = await secretHash(bearer);
  const row = await env.DB.prepare(
    "SELECT revoked FROM computers WHERE server_id = ? AND secret_hash = ? LIMIT 1",
  )
    .bind(serverId, hash)
    .first<{ revoked: number }>();

  if (!row || row.revoked) {
    return json({ error: "bad_server_credentials" }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE computers SET last_seen_at = ? WHERE server_id = ?",
  )
    .bind(now, serverId)
    .run();

  const id = env.SERVER_HUB.idFromName(serverId);
  const stub = env.SERVER_HUB.get(id);
  const forward = new Request(
    `${url.origin}/internal?role=server`,
    request,
  );
  return stub.fetch(forward);
}

async function handleClientWebSocket(
  request: Request,
  env: Env,
  outerUrl: URL,
): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket Upgrade", { status: 426 });
  }

  const serverId = outerUrl.searchParams.get("server_id");
  const token = outerUrl.searchParams.get("token")?.trim() ?? "";

  if (!serverId || !token) {
    return json({ error: "missing_client_params" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenHash = await secretHash(token);

  const tok = await env.DB.prepare(
    `SELECT server_id FROM client_sessions
     WHERE token_hash = ? AND server_id = ? AND expires_at > ? LIMIT 1`,
  )
    .bind(tokenHash, serverId, now)
    .first<{ server_id: string }>();

  if (!tok) {
    return json({ error: "bad_client_token" }, 403);
  }

  const comp = await env.DB.prepare(
    "SELECT revoked FROM computers WHERE server_id = ? LIMIT 1",
  )
    .bind(serverId)
    .first<{ revoked: number }>();

  if (!comp || comp.revoked) {
    return json({ error: "computer_revoked" }, 403);
  }

  const sid = crypto.randomUUID();
  const id = env.SERVER_HUB.idFromName(serverId);
  const stub = env.SERVER_HUB.get(id);
  const inner = new URL(request.url);
  inner.searchParams.set("role", "client");
  inner.searchParams.set("sid", sid);
  const forward = new Request(inner.toString(), request);
  return stub.fetch(forward);
}
