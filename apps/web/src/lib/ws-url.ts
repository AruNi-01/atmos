import { getRuntimeApiConfig, isTauriRuntime } from "./desktop-runtime";

/**
 * Build a fully-qualified WebSocket URL, handling protocol detection,
 * Tauri/desktop runtime config, and dev-mode port defaults.
 */
export async function buildWsUrl(
  path: string,
  params?: Record<string, string>,
): Promise<string> {
  const cfg = await getRuntimeApiConfig();

  const protocol =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss:"
      : "ws:";

  const base = isTauriRuntime()
    ? `ws://${cfg.host}:${cfg.port}`
    : `${protocol}//${cfg.host}:${cfg.port}`;

  const url = new URL(path, base);

  if (cfg.token) {
    url.searchParams.set("token", cfg.token);
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * Synchronous WebSocket URL builder for cases where runtime config is not
 * yet available (falls back to window.location or localhost defaults).
 */
export function buildWsUrlSync(
  path: string,
  params?: Record<string, string>,
): string {
  if (typeof window === "undefined") {
    return `ws://localhost:30303${path}`;
  }

  const protocol =
    window.location.protocol === "https:" ? "wss:" : "ws:";

  let host: string;
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return `${process.env.NEXT_PUBLIC_WS_URL}${path}`;
  } else if (process.env.NODE_ENV === "development") {
    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    host = isLocal ? "localhost:30303" : `${window.location.hostname}:30303`;
  } else {
    host = window.location.host;
  }

  const url = new URL(path, `${protocol}//${host}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
