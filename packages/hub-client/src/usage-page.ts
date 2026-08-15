import { hubConfigured } from "./config";
import { hubFetch } from "./http";

export type UsageVisibility = "off" | "public" | "unlisted";

export type HubUsagePage = {
  handle: string | null;
  handle_claimed: boolean;
  visibility: UsageVisibility;
  github_username: string | null;
  x_username: string | null;
  include_cost: boolean;
  url: string | null;
  has_unlisted_secret: boolean;
  updated_at: number | null;
};

export type HubUsagePagePut = {
  handle?: string;
  visibility?: UsageVisibility;
  include_cost?: boolean;
  github_username?: string | null;
  x_username?: string | null;
  snapshot?: unknown;
};

export type HubUsagePagePutResult = {
  handle: string;
  url: string;
  visibility: UsageVisibility;
  unlisted_secret: string | null;
  updated_at: number;
};

export type HubPublicTok = {
  handle: string;
  avatar_url: string | null;
  github_username: string | null;
  x_username: string | null;
  visibility: "public" | "unlisted";
  include_cost: boolean;
  generated_at: number;
  snapshot: unknown;
};

export async function hubGetUsagePage(): Promise<HubUsagePage | null> {
  if (!hubConfigured()) return null;
  const res = await hubFetch("/v1/me/usage-page");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Hub /v1/me/usage-page ${res.status}`);
  return res.json() as Promise<HubUsagePage>;
}

export async function hubPutUsagePage(
  body: HubUsagePagePut,
): Promise<HubUsagePagePutResult> {
  const res = await hubFetch("/v1/me/usage-page", {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Hub PUT /v1/me/usage-page ${res.status}`);
  }
  return res.json() as Promise<HubUsagePagePutResult>;
}

export async function hubDeleteUsagePage(): Promise<void> {
  const res = await hubFetch("/v1/me/usage-page", { method: "DELETE" });
  if (!res.ok) throw new Error(`Hub DELETE /v1/me/usage-page ${res.status}`);
}

export async function hubMintUsagePageSecret(): Promise<{
  unlisted_secret: string;
  url: string | null;
}> {
  const res = await hubFetch("/v1/me/usage-page/unlisted-secret", {
    method: "POST",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Hub mint usage secret ${res.status}`);
  }
  return res.json() as Promise<{ unlisted_secret: string; url: string | null }>;
}

export type HubLeaderboardEntry = {
  rank: number;
  handle: string;
  avatar_url: string | null;
  github_username: string | null;
  x_username: string | null;
  value: number;
};

export type HubLeaderboardBoard = {
  total: number;
  entries: HubLeaderboardEntry[];
  viewer: HubLeaderboardEntry | null;
};

export type HubLeaderboards = {
  updated_at: number | null;
  tokens: HubLeaderboardBoard;
  cost: HubLeaderboardBoard;
};

export async function hubGetPublicLeaderboards(
  viewer?: string | null,
): Promise<HubLeaderboards | null> {
  if (!hubConfigured()) return null;
  const query = viewer ? `?viewer=${encodeURIComponent(viewer.replace(/^@+/, ""))}` : "";
  const res = await hubFetch(`/v1/public/tok-leaderboards${query}`);
  if (!res.ok) return null;
  return res.json() as Promise<HubLeaderboards>;
}

export async function hubGetPublicTok(
  handle: string,
  k?: string | null,
): Promise<HubPublicTok | null> {
  if (!hubConfigured()) return null;
  const slug = handle.replace(/^@+/, "");
  const query = k ? `?k=${encodeURIComponent(k)}` : "";
  const res = await hubFetch(`/v1/public/tok/${encodeURIComponent(slug)}${query}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Hub /v1/public/tok ${res.status}`);
  return res.json() as Promise<HubPublicTok>;
}
