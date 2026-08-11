/** Cloudflare Worker bindings for Atmos Hub (APP-056). */

export type HubEnv = {
  DB: D1Database;
  /** Optional R2 for usage-share OG images */
  USAGE_OG?: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Comma-separated browser origins (app + landing). */
  ALLOWED_ORIGINS?: string;
  /** Hub → Relay projection secret (optional until relay migration). */
  RELAY_HUB_SYNC_SECRET?: string;
  RELAY_URL?: string;
};

/** Default browser origins when ALLOWED_ORIGINS is unset (local + product). */
export const DEFAULT_ALLOWED_ORIGINS =
  "http://localhost:3030,http://127.0.0.1:3030,http://localhost:30303,http://127.0.0.1:30303,http://localhost:3000,https://app.atmos.land,https://atmos.land,https://hub.atmos.land,http://localhost:8787";

export function allowedOrigins(env: HubEnv): string[] {
  const raw = env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
