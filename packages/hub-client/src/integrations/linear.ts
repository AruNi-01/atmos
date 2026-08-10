import { hubFetch } from "../http";
import type { HubLinearStatus } from "../types";

export async function hubLinearStatus(): Promise<HubLinearStatus> {
  const res = await hubFetch("/v1/me/integrations/linear");
  if (res.status === 401) {
    return { connected: false };
  }
  if (!res.ok) throw new Error(`Hub linear status ${res.status}`);
  return res.json() as Promise<HubLinearStatus>;
}

/** Prefer OAuth product path; kept for internal/tests. */
export async function hubLinearConnectApiKey(payload: {
  api_key: string;
  viewer_name?: string;
  viewer_email?: string;
  viewer_id?: string;
}): Promise<void> {
  const res = await hubFetch("/v1/me/integrations/linear", {
    method: "PUT",
    body: JSON.stringify({
      auth_method: "api_key",
      api_key: payload.api_key,
      viewer_name: payload.viewer_name,
      viewer_email: payload.viewer_email,
      viewer_id: payload.viewer_id,
      connected_at: new Date().toISOString(),
    }),
  });
  if (res.status === 401) {
    throw new Error("Sign in to Atmos required");
  }
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export async function hubLinearDisconnect(): Promise<void> {
  const res = await hubFetch("/v1/me/integrations/linear", {
    method: "DELETE",
  });
  if (res.status === 401) {
    throw new Error("Sign in to Atmos required");
  }
  if (!res.ok) {
    throw new Error(await res.text());
  }
}
