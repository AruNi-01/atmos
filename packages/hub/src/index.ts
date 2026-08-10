/**
 * Atmos Hub Worker — APP-056 control plane.
 * Better Auth (GitHub + Google) + Drizzle + D1.
 * Linear credentials live under user_id only (APP-057) — no local dual store.
 */
import { createAuth } from "./auth";
import { createDb } from "./db/client";
import type { HubEnv } from "./env";
import { preflight, withCors } from "./cors";

function authFromEnv(env: HubEnv) {
  const db = createDb(env);
  return createAuth(db, env);
}
import {
  listDevices,
  mintDevice,
  revokeDevice,
  rotateDevice,
} from "./devices";
import {
  deleteLinearIntegration,
  getLinearIntegration,
  getLinearIntegrationStatus,
  upsertLinearIntegration,
  type LinearCredentialsPayload,
} from "./integrations";
import { publicProfileJson, publicShareJson } from "./public";
import { projectDeviceToRelay } from "./relay-sync";
import {
  createUsageShare,
  listUsageShares,
  revokeUsageShare,
  updateUsageShare,
} from "./usage-shares";
import { eq } from "drizzle-orm";
import { userProfiles } from "./db/schema";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Public share/profile: never edge-cache so revoke is immediately unreadable. */
function jsonPublicNoStore(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

function sessionCookie(request: Request): Headers {
  // Forward cookies to better-auth
  return new Headers({
    cookie: request.headers.get("cookie") ?? "",
    origin: request.headers.get("origin") ?? "",
  });
}

async function requireSession(
  env: HubEnv,
  request: Request,
): Promise<{ userId: string; email?: string | null; name?: string | null } | Response> {
  const auth = authFromEnv(env);
  const session = await auth.api.getSession({
    headers: sessionCookie(request),
  });
  if (!session?.user?.id) {
    return json({ error: "unauthorized", message: "Sign in required" }, 401);
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

/**
 * Session cookie (browser) **or** Hub-minted device credential Bearer
 * (local runtime / CLI). Used for pulling secrets that stay Hub-owned.
 */
async function requireSessionOrDevice(
  env: HubEnv,
  request: Request,
): Promise<{ userId: string; email?: string | null; name?: string | null } | Response> {
  const session = await requireSession(env, request);
  if (!(session instanceof Response)) {
    return session;
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return session;
  }
  const credential = authHeader.slice("Bearer ".length).trim();
  if (credential.length < 32) {
    return session;
  }

  const db = createDb(env);
  const { verifyDeviceCredential } = await import("./devices");
  const device = await verifyDeviceCredential(db, credential);
  if (!device) {
    return json({ error: "unauthorized", message: "Sign in or enroll a device" }, 401);
  }
  return { userId: device.userId, email: null, name: null };
}

async function ensureProfile(
  env: HubEnv,
  userId: string,
  name?: string | null,
  email?: string | null,
) {
  const db = createDb(env);
  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  const base =
    (name || email || userId)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "user";
  let handle = base;
  let n = 0;
  while (true) {
    const clash = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.handle, handle))
      .limit(1);
    if (!clash[0]) break;
    n += 1;
    handle = `${base}${n}`;
  }
  await db.insert(userProfiles).values({
    userId,
    handle,
    updatedAt: new Date(),
  });
  return { userId, handle };
}

export default {
  async fetch(request: Request, env: HubEnv): Promise<Response> {
    if (request.method === "OPTIONS") {
      return preflight(env, request);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Better Auth routes (default basePath /api/auth)
      // Verify: GET /api/auth/ok → { status: "ok" }
      if (path.startsWith("/api/auth")) {
        const auth = authFromEnv(env);
        const res = await auth.handler(request);
        return withCors(env, request, res);
      }

      if (path === "/healthz") {
        return withCors(env, request, json({ ok: true, service: "atmos-hub" }));
      }

      // ----- Session routes -----
      if (path === "/v1/me" && request.method === "GET") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const profile = await ensureProfile(
          env,
          session.userId,
          session.name,
          session.email,
        );
        return withCors(
          env,
          request,
          json({
            user_id: session.userId,
            email: session.email,
            name: session.name,
            handle: "handle" in profile ? profile.handle : null,
          }),
        );
      }

      // ----- Devices (APP-056 M13–M15) -----
      if (path === "/v1/devices" && request.method === "GET") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        const rows = await listDevices(db, session.userId);
        return withCors(
          env,
          request,
          json({
            devices: rows.map((d) => ({
              device_id: d.deviceId,
              label: d.label,
              created_at: d.createdAt,
              last_seen_at: d.lastSeenAt,
              rotated_at: d.rotatedAt,
              revoked_at: d.revokedAt,
            })),
          }),
        );
      }

      if (path === "/v1/devices" && request.method === "POST") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const body = (await request.json().catch(() => ({}))) as {
          label?: string;
          app_device_id?: string;
        };
        const db = createDb(env);
        const minted = await mintDevice(db, session.userId, {
          label: body.label,
          appDeviceId: body.app_device_id,
        });
        // Hash is not returned to client for relay; project async
        const te = new TextEncoder();
        const digest = await crypto.subtle.digest(
          "SHA-256",
          te.encode(minted.device_credential),
        );
        const credential_hash = [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const projected = await projectDeviceToRelay(env, {
          user_id: session.userId,
          device_id: minted.device_id,
          credential_hash,
          label: body.label ?? null,
        });
        return withCors(
          env,
          request,
          json({
            device_id: minted.device_id,
            device_credential: minted.device_credential,
            relay_synced: projected.ok,
          }),
        );
      }

      const rotateMatch = path.match(/^\/v1\/devices\/([^/]+)\/rotate$/);
      if (rotateMatch && request.method === "POST") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        const rotated = await rotateDevice(db, session.userId, rotateMatch[1]!);
        if (!rotated) {
          return withCors(env, request, json({ error: "not_found" }, 404));
        }
        const te = new TextEncoder();
        const digest = await crypto.subtle.digest(
          "SHA-256",
          te.encode(rotated.device_credential),
        );
        const credential_hash = [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const projected = await projectDeviceToRelay(env, {
          user_id: session.userId,
          device_id: rotateMatch[1]!,
          credential_hash,
        });
        return withCors(
          env,
          request,
          json({ ...rotated, relay_synced: projected.ok }),
        );
      }

      const revokeMatch = path.match(/^\/v1\/devices\/([^/]+)\/revoke$/);
      if (revokeMatch && request.method === "POST") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        await revokeDevice(db, session.userId, revokeMatch[1]!);
        const projected = await projectDeviceToRelay(env, {
          user_id: session.userId,
          device_id: revokeMatch[1]!,
          credential_hash: "",
          revoked: true,
        });
        return withCors(
          env,
          request,
          json({ ok: true, relay_synced: projected.ok }),
        );
      }

      // ----- Linear integration (APP-057) — Hub-only credentials -----
      if (path === "/v1/me/integrations/linear" && request.method === "GET") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        const status = await getLinearIntegrationStatus(db, session.userId);
        return withCors(env, request, json(status));
      }

      if (
        path === "/v1/me/integrations/linear/credentials" &&
        request.method === "GET"
      ) {
        // Local runtime pulls secrets with Hub session cookie or device Bearer.
        const session = await requireSessionOrDevice(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        const full = await getLinearIntegration(db, session.userId);
        if (!full) {
          return withCors(
            env,
            request,
            json({ error: "not_connected", message: "Connect Linear in Settings" }, 404),
          );
        }
        return withCors(env, request, json(full));
      }

      if (path === "/v1/me/integrations/linear" && request.method === "PUT") {
        // Browser (session) or local API after OAuth (device Bearer).
        const session = await requireSessionOrDevice(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const body = (await request.json()) as LinearCredentialsPayload;
        if (!body?.auth_method) {
          return withCors(
            env,
            request,
            json({ error: "validation", message: "auth_method required" }, 400),
          );
        }
        const db = createDb(env);
        const saved = await upsertLinearIntegration(db, session.userId, body);
        return withCors(env, request, json(saved));
      }

      if (path === "/v1/me/integrations/linear" && request.method === "DELETE") {
        const session = await requireSessionOrDevice(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        await deleteLinearIntegration(db, session.userId);
        return withCors(env, request, json({ ok: true }));
      }

      // ----- Usage shares (APP-056) -----
      if (path === "/v1/usage/shares" && request.method === "GET") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        const shares = await listUsageShares(db, session.userId);
        return withCors(env, request, json({ shares }));
      }

      if (path === "/v1/usage/shares" && request.method === "POST") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const body = await request.json();
        const db = createDb(env);
        const created = await createUsageShare(db, session.userId, body as never);
        return withCors(env, request, json(created));
      }

      const shareMatch = path.match(/^\/v1\/usage\/shares\/([^/]+)$/);
      if (shareMatch && request.method === "PATCH") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const body = await request.json();
        const db = createDb(env);
        const updated = await updateUsageShare(
          db,
          session.userId,
          shareMatch[1]!,
          body as never,
        );
        if (!updated) {
          return withCors(env, request, json({ error: "not_found" }, 404));
        }
        return withCors(env, request, json(updated));
      }

      if (shareMatch && request.method === "DELETE") {
        const session = await requireSession(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        const ok = await revokeUsageShare(db, session.userId, shareMatch[1]!);
        return withCors(
          env,
          request,
          ok ? json({ ok: true }) : json({ error: "not_found" }, 404),
        );
      }

      // ----- Public -----
      const publicShare = path.match(/^\/v1\/public\/shares\/([^/]+)$/);
      if (publicShare && request.method === "GET") {
        const db = createDb(env);
        const data = await publicShareJson(db, publicShare[1]!);
        if (!data) {
          return withCors(
            env,
            request,
            jsonPublicNoStore({ error: "not_found" }, 404),
          );
        }
        return withCors(env, request, jsonPublicNoStore(data));
      }

      const publicUser = path.match(/^\/v1\/public\/u\/([^/]+)$/);
      if (publicUser && request.method === "GET") {
        const db = createDb(env);
        const data = await publicProfileJson(db, decodeURIComponent(publicUser[1]!));
        if (!data) {
          return withCors(
            env,
            request,
            jsonPublicNoStore({ error: "not_found" }, 404),
          );
        }
        return withCors(env, request, jsonPublicNoStore(data));
      }

      return withCors(env, request, json({ error: "not_found" }, 404));
    } catch (e) {
      console.error("[hub]", e);
      return withCors(
        env,
        request,
        json(
          {
            error: "internal",
            message: e instanceof Error ? e.message : "error",
          },
          500,
        ),
      );
    }
  },
};
