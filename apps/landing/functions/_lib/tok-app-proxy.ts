/**
 * APP-061: keep Token Usage / leaderboard share URLs on atmos.land.
 *
 * Cloudflare Pages `_redirects` cannot 200-proxy to another project, so the
 * previous `/tok/* → app.atmos.land` 302 is replaced by this Function.
 * HTML keeps root-relative `/_next` URLs; missing chunks are fetched from the
 * app origin so Next hydrates on atmos.land instead of staying a black shell.
 */

export const APP_ORIGIN = "https://app.atmos.land";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

const STRIP_FROM_UPSTREAM = new Set([
  ...HOP_BY_HOP,
  "set-cookie",
  "content-encoding",
  "content-length",
  "alt-svc",
  "nel",
  "report-to",
  "cf-ray",
  "cf-cache-status",
]);

export type LandingFunctionContext = {
  request: Request;
  next: () => Promise<Response>;
  env: {
    ASSETS: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    };
  };
};

export function isTokPath(pathname: string): boolean {
  return pathname === "/tok" || pathname.startsWith("/tok/");
}

export function isProxiedAppAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/ai-provider/") ||
    pathname.startsWith("/agents/") ||
    pathname === "/icon.svg"
  );
}

export function appUpstreamUrl(
  request: Request,
  appOrigin: string = APP_ORIGIN,
): URL {
  const incoming = new URL(request.url);
  return new URL(`${incoming.pathname}${incoming.search}`, appOrigin);
}

function copyUpstreamHeaders(
  upstream: Headers,
  extra?: Record<string, string>,
): Headers {
  const headers = new Headers();
  upstream.forEach((value, key) => {
    if (!STRIP_FROM_UPSTREAM.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      headers.set(key, value);
    }
  }
  return headers;
}

async function fetchApp(
  request: Request,
  appOrigin: string = APP_ORIGIN,
): Promise<Response> {
  const upstreamUrl = appUpstreamUrl(request, appOrigin);
  const headers = new Headers();
  const accept = request.headers.get("Accept");
  const language = request.headers.get("Accept-Language");
  const ua = request.headers.get("User-Agent");
  if (accept) headers.set("Accept", accept);
  if (language) headers.set("Accept-Language", language);
  headers.set("User-Agent", ua || "atmos-land-tok-proxy");

  return fetch(upstreamUrl, {
    method: request.method,
    headers,
    redirect: "follow",
  });
}

export async function proxyTokPage(
  request: Request,
  appOrigin: string = APP_ORIGIN,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetchApp(request, appOrigin);
  } catch {
    return new Response("Share page unavailable", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html");
  const extra = isHtml
    ? { "Cache-Control": "private, no-store" }
    : undefined;

  // Keep /_next URLs root-relative. Rewriting them to app.atmos.land makes
  // Next hydrate on a foreign origin and the page stays the empty dark shell.
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream.headers, extra),
  });
}

export async function proxyAppAsset(
  request: Request,
  assets: LandingFunctionContext["env"]["ASSETS"],
  appOrigin: string = APP_ORIGIN,
): Promise<Response> {
  const local = await assets.fetch(request);
  if (local.status !== 404) return local;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  try {
    const upstream = await fetchApp(request, appOrigin);
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: copyUpstreamHeaders(upstream.headers),
    });
  } catch {
    return new Response("Asset unavailable", { status: 502 });
  }
}

export async function handleLandingRequest(
  context: LandingFunctionContext,
  appOrigin: string = APP_ORIGIN,
): Promise<Response> {
  const pathname = new URL(context.request.url).pathname;
  if (isTokPath(pathname)) {
    return proxyTokPage(context.request, appOrigin);
  }
  if (isProxiedAppAssetPath(pathname)) {
    return proxyAppAsset(context.request, context.env.ASSETS, appOrigin);
  }
  return context.next();
}
