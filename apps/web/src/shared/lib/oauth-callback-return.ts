/**
 * OAuth callback return context (login + third-party).
 *
 * Callback tabs run in the system browser / a new web tab — not inside Electron —
 * so they cannot call `isDesktopRuntime()`. The starting surface must stamp
 * `client` (and web `return_to`) onto the landing URL, or the callback page
 * infers desktop from the desktop static build / loopback bridge.
 */

export const OAUTH_CALLBACK_CLIENT_PARAM = "client";
export const OAUTH_CALLBACK_RETURN_TO_PARAM = "return_to";
export const DESKTOP_OPEN_HREF = "atmos://open";

export type OAuthCallbackClient = "desktop" | "web";

export type OAuthReturnContext = {
  client: OAuthCallbackClient;
  returnTo: string;
};

const CALLBACK_PATHS = new Set([
  "/hub-auth/done",
  "/hub-auth/bridge",
  "/hub-auth/error",
  "/integrations/linear/callback",
  "/github/setup/complete",
]);

const LINEAR_DESKTOP_CALLBACK_ORIGIN = "http://127.0.0.1:39217";
const RETURN_TO_MAX_LEN = 2048;
const RETURN_CONTEXT_STORAGE_PREFIX = "atmos:oauth-return:";
const returnContextMemory = new Map<string, OAuthReturnContext>();

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function isOAuthCallbackPath(pathname: string): boolean {
  return CALLBACK_PATHS.has(normalizePathname(pathname));
}

export function parseOAuthCallbackClient(
  raw: string | null | undefined,
): OAuthCallbackClient | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "desktop" || value === "web") return value;
  return null;
}

export function sanitizeOAuthReturnTo(
  raw: string | null | undefined,
  origin: string,
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.length > RETURN_TO_MAX_LEN) return null;
  try {
    const base = new URL(origin);
    const url = new URL(trimmed, base);
    if (url.origin !== base.origin) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const path = url.pathname || "/";
    if (!path.startsWith("/") || path.startsWith("//")) return null;
    if (isOAuthCallbackPath(path)) return null;
    return `${path}${url.search}${url.hash}` || "/";
  } catch {
    return null;
  }
}

export function currentOAuthReturnToPath(): string {
  if (typeof window === "undefined") return "/";
  return (
    sanitizeOAuthReturnTo(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      window.location.origin,
    ) ?? "/"
  );
}

function isDesktopStaticBuild(): boolean {
  return (
    process.env.NEXT_PUBLIC_BUILD_TARGET === "desktop" ||
    process.env.BUILD_TARGET === "desktop"
  );
}

/** Infer desktop when the landing page itself is a desktop-only surface. */
export function inferOAuthCallbackClient(opts: {
  origin: string;
  pathname: string;
  /** Override for tests; defaults to the desktop static-export build flag. */
  desktopBuild?: boolean;
}): OAuthCallbackClient {
  if (normalizePathname(opts.pathname).startsWith("/hub-auth/bridge")) {
    return "desktop";
  }
  if (opts.origin === LINEAR_DESKTOP_CALLBACK_ORIGIN) {
    return "desktop";
  }
  // Desktop static export is what the system-browser loopback UI actually serves.
  if (opts.desktopBuild ?? isDesktopStaticBuild()) {
    return "desktop";
  }
  return "web";
}

export function resolveOAuthCallbackReturn(input: {
  clientParam?: string | null;
  returnToParam?: string | null;
  stored?: Partial<OAuthReturnContext> | null;
  origin: string;
  pathname: string;
  desktopBuild?: boolean;
}): OAuthReturnContext {
  const client =
    parseOAuthCallbackClient(input.clientParam) ??
    parseOAuthCallbackClient(input.stored?.client) ??
    inferOAuthCallbackClient({
      origin: input.origin,
      pathname: input.pathname,
      desktopBuild: input.desktopBuild,
    });
  const returnTo =
    sanitizeOAuthReturnTo(input.returnToParam, input.origin) ??
    sanitizeOAuthReturnTo(input.stored?.returnTo, input.origin) ??
    "/";
  return { client, returnTo };
}

export function oauthCallbackActionHref(ctx: OAuthReturnContext): string {
  return ctx.client === "desktop" ? DESKTOP_OPEN_HREF : ctx.returnTo;
}

export const HUB_AUTH_BRIDGE_PATH = "/hub-auth/bridge";
export const HUB_AUTH_DONE_PATH = "/hub-auth/done";

export function buildHubOAuthCallbackURL(opts: {
  origin: string;
  hub: string;
  provider: string;
  mode: "sign-in" | "link";
  desktop: boolean;
  returnTo?: string;
}): string {
  const landing = buildOAuthLandingQuery({
    provider: opts.provider,
    client: opts.desktop ? "desktop" : "web",
    returnTo: opts.desktop ? undefined : opts.returnTo,
  });
  if (opts.desktop && opts.mode === "sign-in") {
    return `${opts.hub}/v1/desktop-auth/complete?return_to=${encodeURIComponent(
      `${opts.origin}${HUB_AUTH_BRIDGE_PATH}?${landing}`,
    )}`;
  }
  return `${opts.origin}${HUB_AUTH_DONE_PATH}?${landing}`;
}

export function buildOAuthLandingQuery(opts: {
  provider?: string;
  client: OAuthCallbackClient;
  returnTo?: string;
}): string {
  const qs = new URLSearchParams();
  if (opts.provider) qs.set("provider", opts.provider);
  qs.set(OAUTH_CALLBACK_CLIENT_PARAM, opts.client);
  if (opts.client === "web" && opts.returnTo) {
    const path = opts.returnTo.startsWith("/")
      ? sanitizeOAuthReturnTo(opts.returnTo, "https://app.atmos.land")
      : null;
    if (path) qs.set(OAUTH_CALLBACK_RETURN_TO_PARAM, path);
  }
  return qs.toString();
}

function storageKey(state: string): string {
  return `${RETURN_CONTEXT_STORAGE_PREFIX}${state}`;
}

/** Persist return context for providers that cannot put extra query params on redirect_uri. */
export function storeOAuthReturnContext(
  state: string,
  ctx: OAuthReturnContext,
): void {
  const trimmed = state.trim();
  if (!trimmed) return;
  returnContextMemory.set(trimmed, ctx);
  try {
    window.localStorage.setItem(storageKey(trimmed), JSON.stringify(ctx));
  } catch {
    /* private mode / quota / tests */
  }
}

export function resolveOAuthCallbackReturnFromWindow(
  params: { get: (key: string) => string | null },
  opts?: { state?: string | null },
): OAuthReturnContext {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://local.invalid";
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";
  return resolveOAuthCallbackReturn({
    clientParam: params.get(OAUTH_CALLBACK_CLIENT_PARAM),
    returnToParam: params.get(OAUTH_CALLBACK_RETURN_TO_PARAM),
    stored: opts?.state ? readOAuthReturnContext(opts.state) : null,
    origin,
    pathname,
  });
}

export function readOAuthReturnContext(
  state: string | null | undefined,
): OAuthReturnContext | null {
  const trimmed = (state ?? "").trim();
  if (!trimmed) return null;
  const fromMemory = returnContextMemory.get(trimmed);
  if (fromMemory) return fromMemory;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(trimmed));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OAuthReturnContext>;
    const client = parseOAuthCallbackClient(parsed.client);
    if (!client) return null;
    const ctx: OAuthReturnContext = {
      client,
      returnTo: typeof parsed.returnTo === "string" ? parsed.returnTo : "/",
    };
    returnContextMemory.set(trimmed, ctx);
    return ctx;
  } catch {
    return null;
  }
}

export function __resetOAuthReturnContextForTests(): void {
  returnContextMemory.clear();
}
