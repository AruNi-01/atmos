import { isSharePayload } from "@/features/token-usage/token-usage-share-payload";
import type { TokenUsageSharePayload } from "@/features/token-usage/token-usage-share-payload";
import {
  PUBLIC_TOK_PREVIEW_HANDLE,
  buildPublicTokPreview,
} from "@/features/token-usage/public-tok-preview";

export type PublicTokData = {
  handle: string;
  avatar_url: string | null;
  github_username: string | null;
  x_username: string | null;
  generated_at: number;
  snapshot: TokenUsageSharePayload;
};

export function hubPublicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_ATMOS_HUB_URL?.trim().replace(/\/$/, "") ||
    "https://hub.atmos.land"
  );
}

export type PublicLeaderboardEntry = {
  rank: number;
  handle: string;
  avatar_url: string | null;
  github_username: string | null;
  x_username: string | null;
  value: number;
  computer_count?: number;
};

export type PublicLeaderboards = {
  updated_at: number | null;
  tokens: {
    total: number;
    entries: PublicLeaderboardEntry[];
    viewer: PublicLeaderboardEntry | null;
  };
  cost: {
    total: number;
    entries: PublicLeaderboardEntry[];
    viewer: PublicLeaderboardEntry | null;
  };
};

export async function fetchPublicLeaderboards(
  viewer?: string | null,
): Promise<PublicLeaderboards | null> {
  const query = viewer
    ? `?viewer=${encodeURIComponent(viewer.replace(/^@+/, ""))}`
    : "";
  try {
    const res = await fetch(
      `${hubPublicOrigin()}/v1/public/tok-leaderboards${query}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const data = (await res.json()) as PublicLeaderboards;
      if (
        process.env.NODE_ENV === "development" &&
        (data.tokens.entries?.length ?? 0) === 0 &&
        (data.cost.entries?.length ?? 0) === 0
      ) {
        return buildPreviewLeaderboards();
      }
      return data;
    }
  } catch {
    /* fall through to local preview */
  }
  if (process.env.NODE_ENV === "development") {
    return buildPreviewLeaderboards();
  }
  return null;
}

const PREVIEW_HANDLES = [
  "nova",
  "pixel",
  "orbit",
  "quartz",
  "ember",
  "harbor",
  "lumen",
  "nimbus",
  "cedar",
  "volta",
  "aster",
  "kepler",
  "ridge",
  "sable",
  "ion",
  "prism",
  "drift",
  "helios",
  "maple",
  "cobalt",
  "finch",
  "aurora",
  "slate",
  "vega",
  "onyx",
  "echo",
  "solace",
  "brine",
  "kite",
  "amber",
  "grove",
  "polar",
  "quartzite",
  "wren",
  "axiom",
  "petal",
  "forge",
  "cinder",
  "haze",
  "relay",
  "silo",
  "tide",
] as const;

function previewSocials(
  index: number,
  handle: string,
): Pick<PublicLeaderboardEntry, "github_username" | "x_username"> {
  return {
    x_username: index % 3 === 2 ? null : handle,
    github_username: index % 4 === 3 ? null : handle,
  };
}

function rankedPreviewRows(values: number[]): PublicLeaderboardEntry[] {
  return values.map((value, index) => {
    const handle = PREVIEW_HANDLES[index] ?? `user${index}`;
    return {
      rank: index + 1,
      handle,
      avatar_url: null,
      ...previewSocials(index, handle),
      value,
      ...(index % 5 === 0 ? { computer_count: 3 } : {}),
    };
  });
}

function buildPreviewLeaderboards(): PublicLeaderboards {
  const tokenValues = Array.from({ length: 42 }, (_, i) =>
    Math.round(18_400_000 - i * 312_000 - (i % 5) * 18_000),
  );
  const costValues = Array.from({ length: 42 }, (_, i) =>
    Number((86.4 - i * 1.35 - (i % 4) * 0.2).toFixed(1)),
  );
  const tokenRows = rankedPreviewRows(tokenValues);
  const costRows = rankedPreviewRows(costValues);
  return {
    updated_at: Date.now(),
    tokens: {
      total: tokenRows.length,
      entries: tokenRows.slice(0, 30),
      viewer: null,
    },
    cost: {
      total: costRows.length,
      entries: costRows.slice(0, 30),
      viewer: null,
    },
  };
}

export async function fetchPublicTok(
  handle: string,
  k?: string | null,
): Promise<PublicTokData | null> {
  const slug = handle.replace(/^@+/, "");
  if (!slug) return null;
  if (
    process.env.NODE_ENV === "development" &&
    slug === PUBLIC_TOK_PREVIEW_HANDLE
  ) {
    return buildPublicTokPreview();
  }
  const query = k ? `?k=${encodeURIComponent(k)}` : "";
  const res = await fetch(
    `${hubPublicOrigin()}/v1/public/tok/${encodeURIComponent(slug)}${query}`,
    { cache: "no-store" },
  );
  if (res.status === 404 || !res.ok) return null;
  const body = (await res.json()) as {
    handle?: string;
    avatar_url?: string | null;
    github_username?: string | null;
    x_username?: string | null;
    generated_at?: number;
    snapshot?: unknown;
  };
  if (!body.handle || !isSharePayload(body.snapshot)) return null;
  return {
    handle: body.handle,
    avatar_url: body.avatar_url ?? null,
    github_username: body.github_username ?? null,
    x_username: body.x_username ?? null,
    generated_at: body.generated_at ?? body.snapshot.generated_at,
    snapshot: body.snapshot,
  };
}
