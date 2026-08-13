const SESSION_PREFIX = "/s/";

const ALLOWED_UPSTREAM = new Set([
  "/health",
  "/stream.avcc",
  "/stream.mjpeg",
  "/stream.h264",
  "/ws",
  "/config",
  "/stream-settings",
  "/screenshot",
  "/logs",
  "/ax",
  "/events",
]);

export type ParsedProxyPath =
  | { kind: "invoke" }
  | { kind: "session"; token: string; upstreamPath: string };

export function parseProxyPath(pathname: string): ParsedProxyPath | null {
  const path = pathname.split("?")[0] || "/";
  if (path === "/v1/invoke") return { kind: "invoke" };
  if (!path.startsWith(SESSION_PREFIX)) return null;
  const rest = path.slice(SESSION_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const token = rest.slice(0, slash);
  const upstreamPath = rest.slice(slash);
  if (!token) return null;
  return { kind: "session", token, upstreamPath };
}

export function isAllowedUpstreamPath(upstreamPath: string): boolean {
  const path = (upstreamPath.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (ALLOWED_UPSTREAM.has(path)) return true;
  // Allow stream-settings derived from any last-segment replacement.
  const last = path.split("/").filter(Boolean).pop();
  return last === "stream-settings" || last === "health";
}

export function authorizeSessionToken(
  pathToken: string,
  sessionToken: string,
): boolean {
  return Boolean(pathToken) && pathToken === sessionToken;
}

export function authorizeControlBearer(
  header: string | undefined,
  expected: string,
): boolean {
  if (!header || !expected) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  return header.slice(prefix.length) === expected;
}
