const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTS.has(host);
}

export type LocalApiTarget = {
  host: string;
  port: number;
  unixSocket?: string | null;
};

function assertLoopbackTerminalUrl(requestedUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(requestedUrl);
  } catch {
    throw new Error("Invalid terminal stream URL");
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("Desktop terminal IPC only accepts ws/wss URLs");
  }
  if (!isLoopbackHostname(parsed.hostname)) {
    throw new Error("Desktop terminal IPC only accepts loopback targets");
  }
  if (!parsed.pathname.startsWith("/ws/terminal/")) {
    throw new Error("Desktop terminal IPC only accepts /ws/terminal/");
  }
  return parsed;
}

/**
 * Rebuild a renderer-supplied terminal WS URL onto the local sidecar.
 * Rejects non-loopback hosts so the IPC bridge cannot be pointed off-box.
 */
export function rewriteTerminalStreamUrlToLocalApi(
  requestedUrl: string,
  api: LocalApiTarget,
): string {
  const parsed = assertLoopbackTerminalUrl(requestedUrl);
  const rewritten = new URL(parsed.toString());
  rewritten.protocol = "ws:";
  rewritten.hostname = api.host;
  rewritten.port = String(api.port);
  return rewritten.toString();
}

/**
 * `ws` package unix URL: `ws+unix://<abs-socket>:/pathname?query`
 */
export function rewriteTerminalStreamUrlToUnixSocket(
  requestedUrl: string,
  socketPath: string,
): string {
  const parsed = assertLoopbackTerminalUrl(requestedUrl);
  const path = socketPath.trim();
  if (!path.startsWith("/")) {
    throw new Error("Unix socket path must be absolute");
  }
  return `ws+unix://${path}:${parsed.pathname}${parsed.search}`;
}
