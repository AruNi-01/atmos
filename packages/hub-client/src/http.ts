import { applyHubAuthToHeaders } from "./auth-material";
import { requireHubBaseUrl } from "./config";

/**
 * Hub HTTPS fetch with unified identity attach.
 *
 * - Device credential → `Authorization: Bearer …` when present
 * - Session cookies → `credentials: "include"` (browser jar)
 *
 * Call sites never pass cookie/device explicitly.
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
  applyHubAuthToHeaders(headers);
  return fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: "include",
  });
}
