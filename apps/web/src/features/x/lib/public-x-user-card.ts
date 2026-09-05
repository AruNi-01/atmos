import { queryKeys } from "@/api/query/query-keys";

/** Same public host Great UI Twitter(X) Card uses. CORS is `*`. */
export const PUBLIC_X_USER_API = "https://api.fxtwitter.com";

export type XUserWebsite = {
  url: string;
  display_url: string;
};

export type XUserCardPayload = {
  username: string;
  name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  following: number;
  followers: number;
  joined: string | null;
  location: string | null;
  website: XUserWebsite | null;
};

export function normalizeXUsername(username?: string | null): string | null {
  if (!username) return null;
  let value = username.trim();
  if (!value) return null;
  value = value.replace(/^https?:\/\//i, "");
  value = value.replace(/^(www\.)?/i, "");
  value = value.replace(/^(x\.com|twitter\.com)\//i, "");
  value = value.replace(/^@+/, "").replace(/\/+$/, "").split("/")[0] ?? "";
  value = value.trim();
  if (!value) return null;
  if (!/^[A-Za-z0-9_]{1,30}$/.test(value)) return null;
  return value;
}

export function upgradeXAvatarUrl(url?: string | null): string | null {
  if (!url) return null;
  return url.replace("_normal", "_400x400");
}

export function formatXJoinedDate(joined: string, locale = "en"): string | null {
  const date = new Date(joined);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

export function formatXCount(count: number, locale = "en"): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, Math.floor(count)));
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return 0;
}

function parseWebsite(raw: unknown): XUserWebsite | null {
  if (!raw || typeof raw !== "object") return null;
  const website = raw as { url?: unknown; display_url?: unknown };
  const url = asNonEmptyString(website.url);
  if (!url) return null;
  return {
    url,
    display_url: asNonEmptyString(website.display_url) ?? url,
  };
}

export function parsePublicXUserCard(
  body: unknown,
  fallbackUsername: string,
): XUserCardPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid X user payload");
  }
  const data = body as { code?: unknown; user?: unknown };
  if (data.code !== 200 || !data.user || typeof data.user !== "object") {
    throw new Error(`X user '${fallbackUsername}' not found`);
  }
  const user = data.user as {
    screen_name?: unknown;
    name?: unknown;
    avatar_url?: unknown;
    banner_url?: unknown;
    description?: unknown;
    following?: unknown;
    followers?: unknown;
    joined?: unknown;
    location?: unknown;
    website?: unknown;
  };
  const username =
    normalizeXUsername(asNonEmptyString(user.screen_name)) ?? fallbackUsername;
  return {
    username,
    name: asNonEmptyString(user.name),
    avatar_url: upgradeXAvatarUrl(asNonEmptyString(user.avatar_url)),
    banner_url: asNonEmptyString(user.banner_url),
    bio: asNonEmptyString(user.description),
    following: asCount(user.following),
    followers: asCount(user.followers),
    joined: asNonEmptyString(user.joined),
    location: asNonEmptyString(user.location),
    website: parseWebsite(user.website),
  };
}

export async function fetchPublicXUserCard(
  username: string,
): Promise<XUserCardPayload> {
  const normalized = normalizeXUsername(username);
  if (!normalized) {
    throw new Error("X username is required");
  }

  const res = await fetch(
    `${PUBLIC_X_USER_API}/${encodeURIComponent(normalized)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`X user '${normalized}' not found`);
  }
  return parsePublicXUserCard(await res.json(), normalized);
}

export function publicXUserCardQueryOptions(
  params: { username: string },
  options?: { enabled?: boolean },
) {
  const username = normalizeXUsername(params.username) ?? "";
  return {
    queryKey: queryKeys.publicX.userCard(username),
    queryFn: () => fetchPublicXUserCard(username),
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(username),
    retry: 1,
  };
}
