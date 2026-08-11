import { allowedOrigins, type HubEnv } from "./env";

export function corsHeaders(env: HubEnv, request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = allowedOrigins(env);
  const allow =
    origin && allowed.includes(origin) ? origin : allowed[0] ?? "http://localhost:3000";

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Cookie",
    "Access-Control-Expose-Headers": "Set-Cookie",
    Vary: "Origin",
  };
}

export function withCors(
  env: HubEnv,
  request: Request,
  response: Response,
): Response {
  const headers = new Headers(response.headers);
  const extra = corsHeaders(env, request);
  for (const [k, v] of Object.entries(extra)) {
    headers.set(k, v as string);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function preflight(env: HubEnv, request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env, request) });
}
