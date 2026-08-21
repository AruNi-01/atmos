/**
 * Better Auth entry (CLI + Worker).
 *
 * CLI discovery paths include `./src/auth.ts` — keep this file as the config surface.
 * @see https://better-auth.com/docs/installation
 * @see https://better-auth.com/docs/adapters/drizzle
 *
 * Setup checklist:
 * 1. `bun add better-auth @better-auth/drizzle-adapter drizzle-orm`
 * 2. Env: BETTER_AUTH_SECRET (min 32), BETTER_AUTH_URL
 * 3. This file: database + socialProviders (GitHub + Google only)
 * 4. Worker routes `/api/auth/*` → auth.handler(request)
 * 5. Schema: `bunx @better-auth/cli generate` (or maintain auth tables in db/schema.ts)
 * 6. `bunx drizzle-kit generate && wrangler d1 migrations apply`
 * 7. Verify: GET /api/auth/ok → { status: "ok" }
 */
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { HubDb } from "./db/client";
import * as schema from "./db/schema";
import { pruneUserSessions } from "./user-security";

export type AuthEnv = {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  /**
   * Fallback OAuth / API error page (app origin). Prefer per-flow errorCallbackURL
   * from /v1/oauth/start. Default product app when unset.
   */
  AUTH_ERROR_URL?: string;
};

/** Prefer app error UI over Hub's built-in /error (wrong "Go Home"). */
function authErrorURL(env: AuthEnv): string {
  const fromEnv =
    env.AUTH_ERROR_URL?.trim() ||
    process.env.AUTH_ERROR_URL?.trim() ||
    "";
  if (fromEnv) return fromEnv;
  // Production app; local OAuth always passes errorCallbackURL per request.
  return "https://app.atmos.land/hub-auth/error";
}

function trustedOrigins(env: AuthEnv): string[] {
  // Keep in sync with env.DEFAULT_ALLOWED_ORIGINS / wrangler [vars].
  const raw =
    env.ALLOWED_ORIGINS ??
    "http://localhost:3030,http://127.0.0.1:3030,http://localhost:30303,http://127.0.0.1:30303,http://localhost:3000,https://app.atmos.land,https://atmos.land,https://hub.atmos.land,http://localhost:8787";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Bind Worker secrets into process.env so Better Auth can read
 * BETTER_AUTH_SECRET / BETTER_AUTH_URL without duplicating in config
 * (official guidance: only set baseURL/secret in config if env is NOT set).
 */
export function applyAuthEnv(env: AuthEnv): void {
  if (env.BETTER_AUTH_SECRET) {
    process.env.BETTER_AUTH_SECRET = env.BETTER_AUTH_SECRET;
  }
  if (env.BETTER_AUTH_URL) {
    process.env.BETTER_AUTH_URL = env.BETTER_AUTH_URL;
  }
}

export function createAuth(db: HubDb, env: AuthEnv = {}) {
  applyAuthEnv(env);

  const githubId = env.GITHUB_CLIENT_ID ?? process.env.GITHUB_CLIENT_ID ?? "";
  const githubSecret =
    env.GITHUB_CLIENT_SECRET ?? process.env.GITHUB_CLIENT_SECRET ?? "";
  const googleId = env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";
  const googleSecret =
    env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";

  return betterAuth({
    appName: "Atmos",
    // baseURL / secret omitted when env vars are set (see applyAuthEnv).
    // For local CLI without env, Better Auth still requires a secret:
    ...(process.env.BETTER_AUTH_SECRET
      ? {}
      : {
          secret: "dev-only-hub-secret-min-32-chars!!",
          baseURL: process.env.BETTER_AUTH_URL || "http://localhost:8787",
        }),
    database: drizzleAdapter(db, {
      provider: "sqlite",
      // Model names (user/session/account/verification), NOT raw table aliases.
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    trustedOrigins: trustedOrigins(env),
    // OAuth failures (link/sign-in) must not strand users on hub.atmos.land/error.
    // Per-request errorCallbackURL from /v1/oauth/start overrides this for localhost.
    onAPIError: {
      errorURL: authErrorURL(env),
    },
    // Social only — no emailAndPassword in v1 (APP-056).
    socialProviders: {
      github: {
        clientId: githubId,
        clientSecret: githubSecret,
      },
      google: {
        clientId: googleId,
        clientSecret: googleSecret,
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["github", "google"],
        // GitHub work email vs Google personal (or reverse) is common —
        // without this, link returns email_doesn't_match after OAuth.
        allowDifferentEmails: true,
      },
    },
    user: {
      // Social-only: no password. UI confirms with typed phrase; Hub also
      // exposes POST /v1/me/delete (cookie or device Bearer).
      deleteUser: {
        enabled: true,
      },
    },
    session: {
      // Skill default is 7d; product uses 30d for desktop-friendly sessions.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // unlink-account uses freshSessionMiddleware. Default
      // freshAge is 1 day, which blocks Security settings after login ages.
      // Social-only Hub has no password re-auth; disable freshness gate (0).
      freshAge: 0,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
        // compact = default (base64url + HMAC)
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "memory",
    },
    advanced: {
      // HTTPS Hub (prod): SameSite=None so SPA on localhost / other ports can
      // call Hub with credentials:include after OAuth in a separate tab.
      // HTTP local Hub: Lax is fine (same-host dev).
      useSecureCookies:
        (process.env.BETTER_AUTH_URL || "").startsWith("https") ||
        (env.BETTER_AUTH_URL || "").startsWith("https"),
      defaultCookieAttributes: (() => {
        const https =
          (process.env.BETTER_AUTH_URL || "").startsWith("https") ||
          (env.BETTER_AUTH_URL || "").startsWith("https");
        return {
          sameSite: https ? ("none" as const) : ("lax" as const),
          secure: https,
          httpOnly: true,
        };
      })(),
      // disableCSRFCheck / disableOriginCheck: never enable
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Profile row is ensured lazily in /v1/me; hook reserved for extensions.
            void user;
          },
        },
      },
      session: {
        create: {
          after: async (sess) => {
            // Cap concurrent sessions per user (keep newest + this token).
            const userId = sess.userId;
            const token = sess.token;
            if (userId && token) {
              await pruneUserSessions(db, userId, { keepToken: token });
            }
          },
        },
      },
    },
  });
}

export type AtmosAuth = ReturnType<typeof createAuth>;

/** CLI-friendly export (no live D1). Not used by the Worker at runtime. */
export const auth = null as unknown as AtmosAuth;
