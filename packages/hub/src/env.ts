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

export function allowedOrigins(env: HubEnv): string[] {
  const raw =
    env.ALLOWED_ORIGINS ??
    "http://localhost:3000,https://app.atmos.land,https://atmos.land";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
