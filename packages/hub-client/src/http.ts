import { requireHubBaseUrl } from "./config";

/**
 * Cookie-session Hub fetch (browser / desktop webview).
 * Native may later pass Authorization via custom headers after device enroll.
 */
export async function hubFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = requireHubBaseUrl();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: "include",
  });
}
