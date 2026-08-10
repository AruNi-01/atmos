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

export type AuthEnv = {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
};

function trustedOrigins(env: AuthEnv): string[] {
  const raw =
    env.ALLOWED_ORIGINS ??
    "http://localhost:3000,https://app.atmos.land,https://atmos.land";
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
      },
    },
    session: {
      // Skill default is 7d; product uses 30d for desktop-friendly sessions.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
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
      useSecureCookies:
        (process.env.BETTER_AUTH_URL || "").startsWith("https") ||
        (env.BETTER_AUTH_URL || "").startsWith("https"),
      defaultCookieAttributes: {
        sameSite: "lax",
        httpOnly: true,
      },
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
    },
  });
}

export type AtmosAuth = ReturnType<typeof createAuth>;

/** CLI-friendly export (no live D1). Not used by the Worker at runtime. */
export const auth = null as unknown as AtmosAuth;
