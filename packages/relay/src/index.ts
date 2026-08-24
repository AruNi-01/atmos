/** APP-016: Worker — relay REST + WebSocket + HTTP gateway to ServerHub DO. */

import {
  collectForwardHeaders,
  gatewayBaseUrl,
  matchGatewayPath,
  validateGatewayAccess,
} from "./http-gateway";
import { buildClientSessionUrls } from "./client-session";
import {
  createGithubSetupSession,
  disableGithubEventRoute,
  githubSetupCompletionUrl,
  handleGithubCallback,
  listGithubInstallationRepositories,
  listGithubInstallations,
  upsertGithubEventRoute,
} from "./event-routes";
import { handleGithubWebhook } from "./github-webhook";
import { ServerHub } from "./server-hub";
import { PtDesignRoom } from "./pt-design-room";
import {
  isValidPtDesignRoomId,
  parsePtDesignRoomPath,
} from "./pt-design-room-protocol";

export interface Env {
  SERVER_HUB: DurableObjectNamespace<ServerHub>;
  PT_DESIGN_ROOM: DurableObjectNamespace<PtDesignRoom>;
  DB: D1Database;
  RELAY_SECRET_KEY?: string;
  /** Hub → Relay device projection (APP-056). */
  RELAY_HUB_SYNC_SECRET?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_SETUP_RETURN_ORIGINS?: string;
}

const REGISTER_TOKEN_TTL_SEC = 15 * 60;
const CLIENT_TOKEN_TTL_SEC = 24 * 3600;
const REGISTER_RATE_LIMIT = 30;
const GITHUB_WEBHOOK_RATE_LIMIT = 600;
const GITHUB_CONTROL_RATE_LIMIT = 60;
const PT_DESIGN_ROOM_RATE_LIMIT = 60;
const RATE_WINDOW_SEC = 60;
const COMPUTER_DEVICE_REGISTRATION_LIMIT = 10;
/** Live client sessions per user+Computer. Token Usage side sessions must not kick workbench/mobile. */
const CLIENT_SESSIONS_PER_COMPUTER_LIMIT = 8;
const DEFAULT_RELAY_ORIGIN = "https://relay.atmos.land";
/** Minimum device credential length (characters). */
const MIN_ACCESS_TOKEN_LEN = 32;
const RELAY_SECRET_HEADER = "X-Atmos-Relay-Secret";
const APP_DEVICE_ID_PATTERN = /^[a-f0-9]{64}$/;

/** Hub device credential auth (APP-056). owner = Better Auth user_id */
type DeviceAuth = {
  userId: string;
  deviceId: string;
  credentialHash: string;
};

type AppDeviceIdParseResult =
  | { ok: true; appDeviceId: string }
  | { ok: false; error: "app_device_id_required" | "invalid_app_device_id" };

/** Per-isolate IP rate limits (M1). */
const registerRateByIp = new Map<string, { count: number; windowStart: number }>();
const githubWebhookRateByIp = new Map<string, { count: number; windowStart: number }>();
const githubControlRateByIp = new Map<string, { count: number; windowStart: number }>();
const ptDesignRoomRateByIp = new Map<string, { count: number; windowStart: number }>();

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
      const res = await handleClientWebSocket(request, env, url, "app");
      return withCorsWs(res);
    }

    if (path === "/ws/terminal") {
      const res = await handleClientWebSocket(request, env, url, "terminal");
      return withCorsWs(res);
    }

    if (path === "/ws/pt-design" || path === "/ws/pt-design/") {
      if (request.method === "GET") {
        return withCors(json({ ok: true, service: "pt-design-collab" }));
      }
    }

    const ptDesignRoomId = parsePtDesignRoomPath(path);
    if (ptDesignRoomId) {
      const res = await handlePtDesignRoom(request, env, ptDesignRoomId);
      return withCorsWs(res);
    }

    const gateway = matchGatewayPath(path);
    if (gateway) {
      return withCors(
        await handleHttpGatewayProxy(request, env, url, gateway),
      );
    }

    if (path === "/v1/github/webhook" && request.method === "POST") {
      if (!checkRateLimit(clientIp(request), githubWebhookRateByIp, GITHUB_WEBHOOK_RATE_LIMIT)) {
        return withCors(json({ error: "rate_limited" }, 429));
      }
      return withCors(await handleGithubWebhook(request, env));
    }

    if (path === "/v1/github/callback" && request.method === "GET") {
      return withCors(await handleGithubCallback(request, env, url));
    }

    if (path === "/github/setup/complete" && request.method === "GET") {
      return withCors(
        Response.redirect(githubSetupCompletionUrl(url.searchParams), 302),
      );
    }

    return withCors(await handleApi(request, env, url));
  },
};

export { ServerHub, PtDesignRoom };

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
  h.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  h.set(
    "Access-Control-Allow-Headers",
    `Content-Type, Authorization, X-Request-Id, ${RELAY_SECRET_HEADER}, X-GitHub-Event, X-GitHub-Delivery, X-Hub-Signature-256`,
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

/** Authenticate Bearer as Hub-minted device credential → user_id. */
async function deviceAuthFromRequest(
  request: Request,
  env: Env,
): Promise<DeviceAuth | null> {
  const token = parseBearerToken(request);
  if (!token) {
    return null;
  }
  const credentialHash = await secretHash(token);
  const row = await env.DB.prepare(
    `SELECT device_id, user_id FROM devices
     WHERE credential_hash = ? AND revoked_at IS NULL
     LIMIT 1`,
  )
    .bind(credentialHash)
    .first<{ device_id: string; user_id: string }>();
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE devices SET last_seen_at = ? WHERE device_id = ?`,
  )
    .bind(now, row.device_id)
    .run();
  return {
    userId: row.user_id,
    deviceId: row.device_id,
    credentialHash,
  };
}

async function userIdFromRequest(
  request: Request,
  env: Env,
): Promise<string | null> {
  const auth = await deviceAuthFromRequest(request, env);
  return auth?.userId ?? null;
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

function parseAppDeviceId(
  body: { device?: unknown; app_device_id?: unknown } | null,
): AppDeviceIdParseResult {
  let raw: unknown = body?.app_device_id;
  if (body?.device != null) {
    if (typeof body.device !== "object" || Array.isArray(body.device)) {
      return { ok: false, error: "invalid_app_device_id" };
    }
    raw = (body.device as { app_device_id?: unknown }).app_device_id;
  }

  if (raw == null) {
    return { ok: false, error: "app_device_id_required" };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "invalid_app_device_id" };
  }

  const appDeviceId = raw.trim().toLowerCase();
  if (!APP_DEVICE_ID_PATTERN.test(appDeviceId)) {
    return { ok: false, error: "invalid_app_device_id" };
  }
  return { ok: true, appDeviceId };
}

async function tableExists(env: Env, tableName: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  )
    .bind(tableName)
    .first<{ ok: number }>();
  return !!row;
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

function checkGithubControlRateLimit(request: Request): boolean {
  return checkRateLimit(
    clientIp(request),
    githubControlRateByIp,
    GITHUB_CONTROL_RATE_LIMIT,
  );
}

async function handleApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const path = normalizedPath(url.pathname);

  try {
    if (path === "/healthz" && request.method === "GET") {
      return json({ ok: true });
    }

    const relaySecretError = await requireRelaySecret(request, env);
    if (relaySecretError) {
      return relaySecretError;
    }

    // Hub → Relay device projection (service auth; no end-user tenant mint).
    if (path === "/v1/internal/devices/upsert" && request.method === "POST") {
      const internalAuth = await requireHubSyncAuth(request, env);
      if (internalAuth) return internalAuth;

      const body = (await request.json().catch(() => null)) as {
        user_id?: string;
        device_id?: string;
        credential_hash?: string;
        label?: string | null;
        revoked?: boolean;
      } | null;

      const userIdBody = body?.user_id?.trim() ?? "";
      const deviceId = body?.device_id?.trim() ?? "";
      if (!userIdBody || !deviceId) {
        return json({ error: "invalid_device_payload" }, 400);
      }

      const now = Math.floor(Date.now() / 1000);
      if (body?.revoked) {
        await env.DB.prepare(
          `UPDATE devices SET revoked_at = ?, last_seen_at = ?
           WHERE device_id = ? AND user_id = ?`,
        )
          .bind(now, now, deviceId, userIdBody)
          .run();
        return json({ ok: true, revoked: true });
      }

      const credentialHash = body?.credential_hash?.trim() ?? "";
      if (!credentialHash || credentialHash.length < 32) {
        return json({ error: "invalid_credential_hash" }, 400);
      }

      await env.DB.prepare(
        `INSERT INTO devices(device_id, user_id, credential_hash, label, created_at, last_seen_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(device_id) DO UPDATE SET
           user_id = excluded.user_id,
           credential_hash = excluded.credential_hash,
           label = excluded.label,
           last_seen_at = excluded.last_seen_at,
           revoked_at = NULL`,
      )
        .bind(
          deviceId,
          userIdBody,
          credentialHash,
          body?.label ?? null,
          now,
          now,
        )
        .run();

      return json({ ok: true, device_id: deviceId });
    }

    const deviceAuth = await deviceAuthFromRequest(request, env);
    const userId = deviceAuth?.userId ?? null;

    if (path === "/v1/github/setup_sessions" && request.method === "POST") {
      if (!checkGithubControlRateLimit(request)) {
        return json({ error: "rate_limited" }, 429);
      }
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }
      return createGithubSetupSession(request, env, url, userId);
    }

    if (path === "/v1/github/installations" && request.method === "GET") {
      if (!checkGithubControlRateLimit(request)) {
        return json({ error: "rate_limited" }, 429);
      }
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }
      return listGithubInstallations(env, userId);
    }

    const githubReposMatch = path.match(
      /^\/v1\/github\/installations\/(\d+)\/repositories$/,
    );
    if (githubReposMatch && request.method === "GET") {
      if (!checkGithubControlRateLimit(request)) {
        return json({ error: "rate_limited" }, 429);
      }
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }
      return listGithubInstallationRepositories(
        env,
        userId,
        githubReposMatch[1]!,
      );
    }

    if (path === "/v1/github/event_routes" && request.method === "POST") {
      if (!checkGithubControlRateLimit(request)) {
        return json({ error: "rate_limited" }, 429);
      }
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }
      return upsertGithubEventRoute(request, env, userId);
    }

    const githubRouteDeleteMatch = path.match(
      /^\/v1\/github\/event_routes\/([^/]+)$/,
    );
    if (githubRouteDeleteMatch && request.method === "DELETE") {
      if (!checkGithubControlRateLimit(request)) {
        return json({ error: "rate_limited" }, 429);
      }
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }
      return disableGithubEventRoute(
        env,
        userId,
        decodeURIComponent(githubRouteDeleteMatch[1]!),
      );
    }

    if (path === "/v1/register_tokens" && request.method === "POST") {
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + REGISTER_TOKEN_TTL_SEC;
      const registerToken = randomBase64Url(32);
      const tokenHash = await secretHash(registerToken);

      await env.DB.prepare(
        `INSERT INTO register_tokens(token_hash, user_id, device_id, expires_at, used_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      )
        .bind(tokenHash, userId, deviceAuth?.deviceId ?? null, expiresAt, now)
        .run();

      const relayOrigin = httpOrigin(url);
      const relaySecret = request.headers.get(RELAY_SECRET_HEADER)?.trim() ?? "";
      const relayArg =
        relayOrigin === DEFAULT_RELAY_ORIGIN ? "" : ` --relay ${shellQuote(relayOrigin)}`;
      const registerCommand = relaySecret
        ? `ATMOS_RELAY_SECRET_KEY=${shellQuote(relaySecret)} atmos computer start${relayArg} --token ${shellQuote(registerToken)} --daemon`
        : `atmos computer start${relayArg} --token ${shellQuote(registerToken)} --daemon`;

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
        device?: unknown;
        app_device_id?: unknown;
        registration_meta?: Record<string, unknown> | null;
      } | null;

      const registerToken = body?.register_token?.trim();
      if (!registerToken) {
        return json({ error: "invalid_register_token" }, 400);
      }

      const parsedDeviceId = parseAppDeviceId(body);
      if (!parsedDeviceId.ok) {
        return json({ error: parsedDeviceId.error }, 400);
      }
      const appDeviceId = parsedDeviceId.appDeviceId;

      const now = Math.floor(Date.now() / 1000);
      const tokenHash = await secretHash(registerToken);

      const row = await env.DB.prepare(
        `SELECT user_id FROM register_tokens
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
      )
        .bind(tokenHash, now)
        .first<{ user_id: string }>();

      if (!row) {
        return json({ error: "invalid_register_token" }, 400);
      }

      const deviceRegistration = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM computers WHERE app_device_id = ?",
      )
        .bind(appDeviceId)
        .first<{ count: number }>();

      if ((deviceRegistration?.count ?? 0) >= COMPUTER_DEVICE_REGISTRATION_LIMIT) {
        return json({ error: "computer_device_registration_limit_exceeded" }, 409);
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

      const registrationMetaJson =
        body?.registration_meta != null && typeof body.registration_meta === "object"
          ? JSON.stringify(body.registration_meta)
          : null;

      await env.DB.prepare(
        `INSERT INTO computers(server_id, user_id, secret_hash, revoked, display_name, created_at, last_seen_at, updated_at, registration_meta, app_device_id)
         VALUES (?, ?, ?, 0, ?, ?, NULL, ?, ?, ?)`,
      )
        .bind(
          serverId,
          row.user_id,
          await secretHash(serverSecret),
          displayName,
          now,
          now,
          registrationMetaJson,
          appDeviceId,
        )
        .run();

      const relayOrigin = httpOrigin(url);
      const relayWs = `${wsOrigin(relayOrigin)}/ws/server`;

      return json({
        server_id: serverId,
        server_secret: serverSecret,
        relay_ws_url: relayWs,
        relay_url: relayOrigin,
        display_name: displayName,
        registration_meta: parseRegistrationMeta(registrationMetaJson),
      });
    }

    if (path === "/v1/computers" && request.method === "GET") {
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }

      const { results } = await env.DB.prepare(
        `SELECT server_id, display_name, revoked, created_at, last_seen_at, registration_meta, app_device_id
         FROM computers WHERE user_id = ? ORDER BY created_at DESC`,
      )
        .bind(userId)
        .all<{
          server_id: string;
          display_name: string | null;
          revoked: number;
          created_at: number;
          last_seen_at: number | null;
          registration_meta: string | null;
          app_device_id: string | null;
        }>();

      const computers = (results ?? []).map((c) => ({
        server_id: c.server_id,
        display_name: c.display_name,
        revoked: c.revoked,
        created_at: c.created_at,
        last_seen_at: c.last_seen_at,
        registration_meta: parseRegistrationMeta(c.registration_meta),
        online: c.last_seen_at != null,
        app_device_id: c.app_device_id ?? null,
      }));

      return json({ computers });
    }

    const patchMatch = path.match(/^\/v1\/computers\/([^/]+)$/);
    if (patchMatch && request.method === "PATCH") {
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }

      const serverId = patchMatch[1]!;
      const body = (await request.json().catch(() => null)) as {
        display_name?: string;
      } | null;
      const displayName = body?.display_name?.trim();
      if (!displayName) {
        return json({ error: "display_name_required" }, 400);
      }

      const now = Math.floor(Date.now() / 1000);
      const updated = await env.DB.prepare(
        `UPDATE computers SET display_name = ?, updated_at = ?
         WHERE server_id = ? AND user_id = ? AND revoked = 0`,
      )
        .bind(displayName, now, serverId, userId)
        .run();

      if (!updated.meta.changes) {
        return json({ error: "computer_not_found" }, 404);
      }

      return json({ ok: true, server_id: serverId, display_name: displayName });
    }

    const revokeMatch = path.match(/^\/v1\/computers\/([^/]+)\/revoke$/);
    if (revokeMatch && request.method === "POST") {
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }

      const serverId = revokeMatch[1]!;
      const now = Math.floor(Date.now() / 1000);

      await env.DB.prepare(
        "UPDATE computers SET revoked = 1, updated_at = ? WHERE server_id = ? AND user_id = ?",
      )
        .bind(now, serverId, userId)
        .run();

      await env.DB.prepare(
        "DELETE FROM client_sessions WHERE server_id = ? AND user_id = ?",
      )
        .bind(serverId, userId)
        .run();

      return json({ ok: true });
    }

    const sessionMatch = path.match(/^\/v1\/computers\/([^/]+)\/client_sessions$/);
    if (sessionMatch && request.method === "POST") {
      if (!userId) {
        return json({ error: "unauthorized" }, 401);
      }

      const serverId = sessionMatch[1]!;
      const body = (await request.json().catch(() => ({}))) as {
        client_kind?: string;
      };
      const clientKind = body.client_kind?.trim() || "web";

      const c = await env.DB.prepare(
        "SELECT revoked FROM computers WHERE server_id = ? AND user_id = ?",
      )
        .bind(serverId, userId)
        .first<{ revoked: number }>();

      if (!c || c.revoked) {
        return json({ error: "computer_revoked" }, 404);
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + CLIENT_TOKEN_TTL_SEC;
      const clientToken = randomBase64Url(32);
      const tokenHash = await secretHash(clientToken);

      const sessionCountRow = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM client_sessions WHERE server_id = ? AND user_id = ?",
      )
        .bind(serverId, userId)
        .first<{ count: number }>();
      const overflow =
        (sessionCountRow?.count ?? 0) + 1 - CLIENT_SESSIONS_PER_COMPUTER_LIMIT;
      if (overflow > 0) {
        await env.DB.prepare(
          `DELETE FROM client_sessions WHERE rowid IN (
             SELECT rowid FROM client_sessions
             WHERE server_id = ? AND user_id = ?
             ORDER BY created_at ASC, rowid ASC
             LIMIT ?
           )`,
        )
          .bind(serverId, userId, overflow)
          .run();
      }

      await env.DB.prepare(
        "UPDATE computers SET updated_at = ? WHERE server_id = ? AND user_id = ?",
      )
        .bind(now, serverId, userId)
        .run();

      await env.DB.prepare(
        `INSERT INTO client_sessions(token_hash, user_id, server_id, device_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          tokenHash,
          userId,
          serverId,
          deviceAuth?.deviceId ?? null,
          expiresAt,
          now,
        )
        .run();

      const sessionUrls = buildClientSessionUrls({
        clientKind,
        clientToken,
        relayOrigin: httpOrigin(url),
        serverId,
      });

      return json({
        client_token: clientToken,
        expires_at: expiresAt,
        ws_url: sessionUrls.wsUrl,
        terminal_ws_url: sessionUrls.terminalWsUrl,
        gateway_url: sessionUrls.gatewayUrl,
      });
    }
  } catch (e) {
    console.error("relay request failed", e);
    return json({ error: "internal_server_error" }, 500);
  }

  return json({ error: "not_found", path }, 404);
}

async function requireRelaySecret(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const configuredSecret = env.RELAY_SECRET_KEY?.trim();
  if (!configuredSecret) {
    return null;
  }

  // Hub internal projection uses its own shared secret (Bearer).
  const path = normalizedPath(new URL(request.url).pathname);
  if (path.startsWith("/v1/internal/")) {
    return null;
  }

  const providedSecret = request.headers.get(RELAY_SECRET_HEADER)?.trim() ?? "";
  if (!providedSecret) {
    return json({ error: "relay_secret_required" }, 401);
  }

  const [configuredHash, providedHash] = await Promise.all([
    secretHash(configuredSecret),
    secretHash(providedSecret),
  ]);
  if (configuredHash !== providedHash) {
    return json({ error: "invalid_relay_secret" }, 403);
  }

  return null;
}

/** Hub service → Relay device projection auth. */
async function requireHubSyncAuth(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const configured =
    env.RELAY_HUB_SYNC_SECRET?.trim() || env.RELAY_SECRET_KEY?.trim() || "";
  if (!configured) {
    return json({ error: "hub_sync_not_configured" }, 503);
  }

  const auth = request.headers.get("Authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get(RELAY_SECRET_HEADER)?.trim() ?? "";
  const provided = bearer || headerSecret;
  if (!provided) {
    return json({ error: "unauthorized" }, 401);
  }

  const [configuredHash, providedHash] = await Promise.all([
    secretHash(configured),
    secretHash(provided),
  ]);
  if (configuredHash !== providedHash) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function handleHttpGatewayProxy(
  request: Request,
  env: Env,
  url: URL,
  route: { serverId: string; upstreamPath: string },
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const allowed = await validateGatewayAccess(
    request,
    env,
    route.serverId,
    secretHash,
    userIdFromRequest,
  );
  if (!allowed) {
    return json({ error: "unauthorized" }, 401);
  }

  const upstreamPath = route.upstreamPath + url.search;
  const id = env.SERVER_HUB.idFromName(route.serverId);
  const stub = env.SERVER_HUB.get(id);

  let bodyB64: string | null = null;
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.body
  ) {
    const bytes = new Uint8Array(await request.arrayBuffer());
    let binary = "";
    for (const b of bytes) {
      binary += String.fromCharCode(b);
    }
    bodyB64 = btoa(binary);
  }

  const descriptor = {
    method: request.method,
    path: upstreamPath,
    headers: collectForwardHeaders(request),
    body_b64: bodyB64,
  };

  const forward = new Request("https://do.internal/gateway", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Http-Gateway": "1",
    },
    body: JSON.stringify(descriptor),
  });

  return stub.fetch(forward);
}

async function handlePtDesignRoom(
  request: Request,
  env: Env,
  roomId: string,
): Promise<Response> {
  if (!isValidPtDesignRoomId(roomId)) {
    return json({ error: "invalid_room" }, 400);
  }
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket Upgrade", { status: 426 });
  }
  if (!checkRateLimit(clientIp(request), ptDesignRoomRateByIp, PT_DESIGN_ROOM_RATE_LIMIT)) {
    return json({ error: "rate_limited" }, 429);
  }
  const id = env.PT_DESIGN_ROOM.idFromName(roomId.toLowerCase());
  const stub = env.PT_DESIGN_ROOM.get(id);
  return stub.fetch(request);
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

  // `last_seen_at` is bumped inside the DO (after acceptWebSocket) — see
  // `ServerHub.markServerSeen`. Doing the write here too would race with
  // the close-handler from a prior server WS being replaced and could end
  // up wiping presence right after we restored it.

  const id = env.SERVER_HUB.idFromName(serverId);
  const stub = env.SERVER_HUB.get(id);
  const forward = new Request(
    `${url.origin}/internal?role=server&server_id=${encodeURIComponent(serverId)}`,
    request,
  );
  return stub.fetch(forward);
}

async function handleClientWebSocket(
  request: Request,
  env: Env,
  outerUrl: URL,
  stream: "app" | "terminal",
): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket Upgrade", { status: 426 });
  }

  const serverId = outerUrl.searchParams.get("server_id");
  const token = outerUrl.searchParams.get("token")?.trim() ?? "";
  const clientType = outerUrl.searchParams.get("client_type")?.trim() || "web";

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
  inner.searchParams.set("stream", stream);
  inner.searchParams.set("client_type", clientType);
  const forward = new Request(inner.toString(), request);
  return stub.fetch(forward);
}

function parseRegistrationMeta(
  raw: string | null,
): Record<string, unknown> | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}
