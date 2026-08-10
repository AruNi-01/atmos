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
import {
  appendCodeToReturnTo,
  consumeDesktopAuthCode,
  createDesktopAuthCode,
  isAllowedDesktopReturnTo,
} from "./desktop-auth";
import {
  appendSetCookies,
  isAllowedOAuthCallbackURL,
  isAllowedOAuthMode,
  isAllowedOAuthProvider,
  oauthErrorCallbackURL,
  oauthStartAuthPath,
} from "./oauth-start";
import {
  consumeLinkTicket,
  createLinkTicket,
  deleteUserAndRelated,
  listActiveSessions,
  listLinkedAccounts,
  publicLinkedAccount,
  revokeUserSession,
  unlinkLinkedAccount,
} from "./user-security";
import { makeSignature } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { user, userProfiles } from "./db/schema";

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
  // Fill profile fields for device Bearer (desktop after system-browser OAuth).
  const rows = await db
    .select({
      email: user.email,
      name: user.name,
    })
    .from(user)
    .where(eq(user.id, device.userId))
    .limit(1);
  const row = rows[0];
  return {
    userId: device.userId,
    email: row?.email ?? null,
    name: row?.name ?? null,
  };
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
      // Cookie session (web) or device Bearer (desktop after system-browser OAuth).
      if (path === "/v1/me" && request.method === "GET") {
        const session = await requireSessionOrDevice(env, request);
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

      // ----- User security (linked accounts + browser sessions) -----
      // Bound to user_id — same data whether you proved identity via cookie or device.
      if (path === "/v1/me/accounts" && request.method === "GET") {
        const session = await requireSessionOrDevice(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        const accounts = await listLinkedAccounts(db, session.userId);
        // Enrich missing emails from provider userinfo (GitHub has no id_token email).
        // Best-effort — never fail the list if a provider call errors.
        try {
          const auth = authFromEnv(env);
          const ctx = await auth.$context;
          for (const acc of accounts) {
            if (acc.email || !acc.accessToken) continue;
            const provider = ctx.socialProviders.find(
              (p: { id: string }) => p.id === acc.providerId,
            );
            if (!provider?.getUserInfo) continue;
            try {
              const info = await provider.getUserInfo({
                accessToken: acc.accessToken,
              });
              const email = info?.user?.email?.trim();
              if (email) acc.email = email;
            } catch {
              /* token expired / no email scope */
            }
          }
        } catch {
          /* auth context unavailable */
        }
        return withCors(
          env,
          request,
          json({ accounts: accounts.map(publicLinkedAccount) }),
        );
      }

      if (path === "/v1/me/accounts/unlink" && request.method === "POST") {
        const session = await requireSessionOrDevice(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const body = (await request.json().catch(() => ({}))) as {
          provider_id?: string;
          account_id?: string;
        };
        const providerId = (body.provider_id ?? "").trim();
        if (!providerId) {
          return withCors(
            env,
            request,
            json({ error: "invalid_provider", message: "provider_id required" }, 400),
          );
        }
        const db = createDb(env);
        const result = await unlinkLinkedAccount(db, session.userId, {
          providerId,
          accountId: body.account_id?.trim() || undefined,
        });
        if (!result.ok) {
          return withCors(
            env,
            request,
            json({ error: result.error }, result.status),
          );
        }
        return withCors(env, request, json({ ok: true }));
      }

      if (path === "/v1/me/sessions" && request.method === "GET") {
        const session = await requireSessionOrDevice(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        // Prefer not pruning the browser's current session when over the cap.
        let keepToken: string | undefined;
        try {
          const auth = authFromEnv(env);
          const ba = await auth.api.getSession({
            headers: sessionCookie(request),
          });
          keepToken = ba?.session?.token;
        } catch {
          /* device-only: no cookie */
        }
        const sessions = await listActiveSessions(db, session.userId, {
          keepToken,
        });
        return withCors(env, request, json({ sessions }));
      }

      if (path === "/v1/me/sessions/revoke" && request.method === "POST") {
        const session = await requireSessionOrDevice(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const body = (await request.json().catch(() => ({}))) as {
          token?: string;
        };
        const token = (body.token ?? "").trim();
        if (!token) {
          return withCors(
            env,
            request,
            json({ error: "invalid_token", message: "token required" }, 400),
          );
        }
        const db = createDb(env);
        const result = await revokeUserSession(db, session.userId, token);
        if (!result.ok) {
          return withCors(
            env,
            request,
            json({ error: result.error }, result.status),
          );
        }
        return withCors(env, request, json({ ok: true }));
      }

      // Mint a one-time ticket so desktop/phone (device Bearer only) can open
      // /v1/oauth/start?mode=link&link_ticket=… without a Hub cookie in that browser.
      if (path === "/v1/me/link-ticket" && request.method === "POST") {
        const session = await requireSessionOrDevice(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        const ticket = await createLinkTicket(
          db,
          session.userId,
          session.email ?? "",
        );
        return withCors(env, request, json(ticket));
      }

      // Hard-delete account (user + linked providers + sessions + hub business rows).
      // Cookie session or device Bearer. Confirmation phrase is enforced in the app UI.
      if (path === "/v1/me/delete" && request.method === "POST") {
        const session = await requireSessionOrDevice(env, request);
        if (session instanceof Response) return withCors(env, request, session);
        const db = createDb(env);
        const result = await deleteUserAndRelated(db, session.userId);
        if (!result.ok) {
          return withCors(
            env,
            request,
            json({ error: result.error }, result.status),
          );
        }
        // Best-effort: clear Better Auth session cookie if present.
        try {
          const auth = authFromEnv(env);
          const signOutReq = new Request(
            new URL("/api/auth/sign-out", url.origin).toString(),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: url.origin,
                Cookie: request.headers.get("Cookie") ?? "",
              },
              body: "{}",
            },
          );
          const signOutRes = await auth.handler(signOutReq);
          const headers = new Headers({ "Content-Type": "application/json" });
          appendSetCookies(signOutRes, headers);
          return withCors(
            env,
            request,
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers,
            }),
          );
        } catch {
          return withCors(env, request, json({ ok: true }));
        }
      }

      // ----- Devices (APP-056 M13–M15) -----
      if (path === "/v1/devices" && request.method === "GET") {
        const session = await requireSessionOrDevice(env, request);
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

      // ----- OAuth start (new tab / system browser, first-party state cookie) -----
      // GET so the new tab can open Hub top-level → Set-Cookie is first-party → no state_mismatch.
      // mode=sign-in (default) → /api/auth/sign-in/social
      // mode=link → /api/auth/link-social
      //   - session cookie (web), or
      //   - link_ticket from POST /v1/me/link-ticket (desktop/phone device Bearer)
      if (path === "/v1/oauth/start" && request.method === "GET") {
        const provider = (url.searchParams.get("provider") ?? "").trim();
        const callbackURL = (url.searchParams.get("callback_url") ?? "").trim();
        const mode = (url.searchParams.get("mode") ?? "sign-in").trim();
        const linkTicket = (url.searchParams.get("link_ticket") ?? "").trim();
        if (!isAllowedOAuthProvider(provider)) {
          return withCors(
            env,
            request,
            json(
              { error: "invalid_provider", message: "provider must be github or google" },
              400,
            ),
          );
        }
        if (!isAllowedOAuthMode(mode)) {
          return withCors(
            env,
            request,
            json(
              { error: "invalid_mode", message: "mode must be sign-in or link" },
              400,
            ),
          );
        }
        if (!isAllowedOAuthCallbackURL(env, callbackURL, url.origin)) {
          return withCors(
            env,
            request,
            json(
              {
                error: "invalid_callback_url",
                message: "callback_url is not an allowed app or desktop return URL",
              },
              400,
            ),
          );
        }

        const auth = authFromEnv(env);
        const authPath = oauthStartAuthPath(mode);

        // Cookie for Better Auth link-social. Prefer real browser cookie; else
        // mint a short session from one-time link_ticket (device-auth clients).
        let cookieHeader = request.headers.get("Cookie") ?? "";
        /** Temp session for link_ticket path only — deleted after start (not in browser). */
        let linkTempToken: string | undefined;
        if (mode === "link" && linkTicket) {
          const db = createDb(env);
          const claimed = await consumeLinkTicket(db, linkTicket);
          if (!claimed) {
            return withCors(
              env,
              request,
              json(
                {
                  error: "invalid_link_ticket",
                  message: "Link ticket expired or already used",
                },
                401,
              ),
            );
          }
          const ctx = await auth.$context;
          // Temporary session only for the internal link-social call — deleted after
          // OAuth URL is minted so it does not clutter Active sessions as "Unknown".
          const created = await ctx.internalAdapter.createSession(claimed.userId);
          if (!created?.token) {
            return withCors(
              env,
              request,
              json(
                {
                  error: "oauth_start_failed",
                  message: "Could not create temporary session for linking",
                },
                502,
              ),
            );
          }
          linkTempToken = created.token;
          const signed = `${created.token}.${await makeSignature(created.token, ctx.secret)}`;
          const cookieName = ctx.authCookies.sessionToken.name;
          cookieHeader = `${cookieName}=${signed}`;
        }

        // Invoke Better Auth as if the browser POSTed on this Hub origin,
        // so oauth state cookies are first-party. Forward session Cookie for link.
        const startReq = new Request(
          new URL(authPath, url.origin).toString(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Better Auth origin checks use Origin / cookie headers.
              Origin: url.origin,
              Cookie: cookieHeader,
              "User-Agent": request.headers.get("User-Agent") ?? "",
              ...(request.headers.get("CF-Connecting-IP")
                ? {
                    "x-forwarded-for":
                      request.headers.get("CF-Connecting-IP") ?? "",
                  }
                : {}),
            },
            body: JSON.stringify({
              provider,
              callbackURL,
              // Land errors on the app (e.g. /hub-auth/error), not Hub default page.
              errorCallbackURL: oauthErrorCallbackURL(callbackURL, url.origin),
              disableRedirect: true,
            }),
          },
        );
        const startRes = await auth.handler(startReq);

        // Drop link_ticket temp session (OAuth state cookies already set on startRes).
        if (linkTempToken) {
          try {
            const ctx = await auth.$context;
            await ctx.internalAdapter.deleteSession(linkTempToken);
          } catch {
            /* best-effort */
          }
        }
        let body: { url?: string; redirect?: boolean; message?: string } = {};
        try {
          body = (await startRes.json()) as {
            url?: string;
            redirect?: boolean;
            message?: string;
          };
        } catch {
          /* non-json */
        }
        const oauthUrl = typeof body.url === "string" ? body.url : "";
        if (!startRes.ok || !oauthUrl) {
          const linkNeedsSession =
            mode === "link" &&
            (startRes.status === 401 || startRes.status === 403);
          return withCors(
            env,
            request,
            json(
              {
                error: linkNeedsSession
                  ? "session_required"
                  : "oauth_start_failed",
                message: linkNeedsSession
                  ? "Sign in before linking another account"
                  : mode === "link"
                    ? "Could not start account linking"
                    : "Could not start provider sign-in",
                status: startRes.status,
                detail: body.message,
              },
              linkNeedsSession ? 401 : 502,
            ),
          );
        }

        const headers = new Headers({ Location: oauthUrl });
        appendSetCookies(startRes, headers);
        // Top-level navigation — CORS not required, but keep consistent.
        return withCors(
          env,
          request,
          new Response(null, { status: 302, headers }),
        );
      }

      // ----- Desktop system-browser OAuth handoff -----
      // After OAuth, Better Auth redirects here (Hub origin → session cookie works).
      // We mint a device + one-time code and bounce to the local Server bridge page.
      if (path === "/v1/desktop-auth/complete" && request.method === "GET") {
        const session = await requireSession(env, request);
        if (session instanceof Response) {
          return withCors(env, request, session);
        }
        const returnTo = url.searchParams.get("return_to") ?? "";
        if (!isAllowedDesktopReturnTo(returnTo)) {
          return withCors(
            env,
            request,
            json(
              {
                error: "invalid_return_to",
                message: "return_to must be a local Atmos /hub-auth/bridge URL",
              },
              400,
            ),
          );
        }
        const db = createDb(env);
        const label = url.searchParams.get("label") ?? "Desktop";
        const { code, payload } = await createDesktopAuthCode(db, session, label);
        // Project device to Relay (best-effort; same as enroll).
        const te = new TextEncoder();
        const digest = await crypto.subtle.digest(
          "SHA-256",
          te.encode(payload.device_credential),
        );
        const credential_hash = [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        await projectDeviceToRelay(env, {
          user_id: session.userId,
          device_id: payload.device_id,
          credential_hash,
          label,
        });
        const location = appendCodeToReturnTo(returnTo, code);
        return withCors(
          env,
          request,
          new Response(null, {
            status: 302,
            headers: { Location: location },
          }),
        );
      }

      if (path === "/v1/desktop-auth/exchange" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as {
          code?: string;
        };
        const db = createDb(env);
        const payload = await consumeDesktopAuthCode(db, body.code ?? "");
        if (!payload) {
          return withCors(
            env,
            request,
            json(
              {
                error: "invalid_code",
                message: "Code expired or already used",
              },
              400,
            ),
          );
        }
        return withCors(env, request, json(payload));
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
