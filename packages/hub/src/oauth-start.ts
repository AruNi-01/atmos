/**
 * Top-level OAuth start (new tab / system browser).
 *
 * Starting social sign-in via XHR from the app origin can store the Better Auth
 * state cookie in a third-party / partitioned context. When Google/GitHub then
 * redirects back to Hub as a first-party top-level navigation, the cookie is
 * missing → `state_mismatch`.
 *
 * Opening this Hub URL as a top-level navigation sets the state cookie as
 * first-party, then 302s to the provider.
 */
import { allowedOrigins, type HubEnv } from "./env";
import { isAllowedDeviceAuthReturnTo } from "./desktop-auth";

export function isAllowedOAuthCallbackURL(
  env: HubEnv,
  callbackURL: string,
  hubOrigin: string,
): boolean {
  try {
    const u = new URL(callbackURL);
    // Desktop / mobile handoff: stay on Hub, then bounce to loopback or deep link.
    if (
      u.origin === hubOrigin &&
      (u.pathname === "/v1/desktop-auth/complete" ||
        u.pathname === "/v1/mobile-auth/complete")
    ) {
      return isAllowedDeviceAuthReturnTo(u.searchParams.get("return_to") ?? "");
    }
    // Hosted / local web app origins (no open redirects).
    return allowedOrigins(env).includes(u.origin);
  } catch {
    return false;
  }
}

export function isAllowedOAuthProvider(
  provider: string,
): provider is "github" | "google" {
  return provider === "github" || provider === "google";
}

/** sign-in (default) or link an additional provider to the current session. */
export function isAllowedOAuthMode(mode: string): mode is "sign-in" | "link" {
  return mode === "sign-in" || mode === "link" || mode === "";
}

export function oauthStartAuthPath(mode: string): "/api/auth/sign-in/social" | "/api/auth/link-social" {
  return mode === "link" ? "/api/auth/link-social" : "/api/auth/sign-in/social";
}

/**
 * Where Better Auth should send OAuth failures (query: ?error=code).
 * Prefer the same app origin as callback_url — never leave users on hub.atmos.land
 * default error page (Go Home → Hub API is wrong).
 */
function errorPageWithOptionalProvider(origin: string, source: URL): string {
  const provider = source.searchParams.get("provider")?.trim();
  if (provider === "github" || provider === "google" || provider === "linear") {
    return `${origin}/hub-auth/error?provider=${encodeURIComponent(provider)}`;
  }
  return `${origin}/hub-auth/error`;
}

export function oauthErrorCallbackURL(
  callbackURL: string,
  hubOrigin: string,
): string {
  try {
    const u = new URL(callbackURL);
    // Desktop / mobile handoff: error back to local UI or deep-link host, not Hub.
    if (
      u.origin === hubOrigin &&
      (u.pathname === "/v1/desktop-auth/complete" ||
        u.pathname === "/v1/mobile-auth/complete")
    ) {
      const returnTo = u.searchParams.get("return_to") ?? "";
      if (returnTo) {
        try {
          const r = new URL(returnTo);
          if (r.protocol === "http:" || r.protocol === "https:") {
            return errorPageWithOptionalProvider(r.origin, r);
          }
        } catch {
          /* fall through */
        }
      }
    }
    // Hosted / local web app callback → sibling error page on same origin.
    return errorPageWithOptionalProvider(u.origin, u);
  } catch {
    return `${hubOrigin}/api/auth/error`;
  }
}

/** Copy Set-Cookie headers from a Response onto a Headers object. */
export function appendSetCookies(from: Response, to: Headers): void {
  const anyHeaders = from.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof anyHeaders.getSetCookie === "function") {
    for (const c of anyHeaders.getSetCookie()) {
      to.append("Set-Cookie", c);
    }
    return;
  }
  const single = from.headers.get("Set-Cookie");
  if (single) to.append("Set-Cookie", single);
}
