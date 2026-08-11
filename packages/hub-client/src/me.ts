import { hubConfigured } from "./config";
import { hubFetch } from "./http";
import type { HubMe } from "./types";

export async function hubMe(): Promise<HubMe | null> {
  if (!hubConfigured()) return null;
  const res = await hubFetch("/v1/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Hub /v1/me ${res.status}`);
  return res.json() as Promise<HubMe>;
}
