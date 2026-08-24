/**
 * Public Token Usage leaderboards (tokens + cost).
 * Totals are written on publish. Write-path rebuilds skip if the cache is
 * younger than 5 minutes; the hourly cron always rebuilds.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import type { HubDb } from "./db/client";
import { usageLeaderboards, userProfiles } from "./db/schema";

export const LEADERBOARD_TOP_N = 30;
export const LEADERBOARD_CACHE_ID = "public_v1";
export const LEADERBOARD_WRITE_REFRESH_MIN_MS = 5 * 60 * 1000;

export function shouldRefreshLeaderboardCache(
  updatedAtMs: number | null | undefined,
  nowMs: number,
  minIntervalMs = LEADERBOARD_WRITE_REFRESH_MIN_MS,
): boolean {
  if (
    updatedAtMs == null ||
    !Number.isFinite(updatedAtMs) ||
    updatedAtMs <= 0
  ) {
    return true;
  }
  return nowMs - updatedAtMs >= minIntervalMs;
}

function cacheUpdatedAtMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

export type LeaderboardEntry = {
  rank: number;
  handle: string;
  avatar_url: string | null;
  github_username: string | null;
  x_username: string | null;
  value: number;
  computer_count?: number;
};

export type LeaderboardBoard = {
  total: number;
  entries: LeaderboardEntry[];
  ranks: Record<string, { rank: number; value: number }>;
};

export type LeaderboardPayload = {
  updated_at: number;
  tokens: LeaderboardBoard;
  cost: LeaderboardBoard;
};

export function extractShareTotals(
  snapshotJson: string | null | undefined,
  includeCost: boolean,
): { tokens: number | null; cost: number | null; computer_count?: number } {
  if (!snapshotJson) return { tokens: null, cost: null };
  try {
    const parsed = JSON.parse(snapshotJson) as {
      summary?: {
        total_tokens?: unknown;
        total_cost_usd?: unknown;
        computer_count?: unknown;
      };
    };
    const tokens = parsed.summary?.total_tokens;
    const cost = parsed.summary?.total_cost_usd;
    const computers = parsed.summary?.computer_count;
    return {
      tokens: typeof tokens === "number" && Number.isFinite(tokens) ? tokens : null,
      cost:
        includeCost && typeof cost === "number" && Number.isFinite(cost)
          ? cost
          : null,
      ...(typeof computers === "number" && Number.isFinite(computers) && computers > 1
        ? { computer_count: Math.min(99, Math.floor(computers)) }
        : {}),
    };
  } catch {
    return { tokens: null, cost: null };
  }
}

function emptyBoard(): LeaderboardBoard {
  return { total: 0, entries: [], ranks: {} };
}

type RankedRow = {
  handle: string;
  avatar_url: string | null;
  github_username: string | null;
  x_username: string | null;
  value: number;
  computer_count?: number;
};

function buildBoard(rows: RankedRow[]): LeaderboardBoard {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const ranks: Record<string, { rank: number; value: number }> = {};
  const entries: LeaderboardEntry[] = [];
  sorted.forEach((row, index) => {
    const rank = index + 1;
    ranks[row.handle] = { rank, value: row.value };
    if (rank <= LEADERBOARD_TOP_N) {
      entries.push({
        rank,
        handle: row.handle,
        avatar_url: row.avatar_url,
        github_username: row.github_username,
        x_username: row.x_username,
        value: row.value,
        ...(row.computer_count && row.computer_count > 1
          ? { computer_count: row.computer_count }
          : {}),
      });
    }
  });
  return { total: sorted.length, entries, ranks };
}

export async function refreshUsageLeaderboards(db: HubDb): Promise<LeaderboardPayload> {
  const rows = await db
    .select({
      handle: userProfiles.handle,
      avatarUrl: userProfiles.avatarUrl,
      githubUsername: userProfiles.githubUsername,
      xUsername: userProfiles.xUsername,
      tokens: userProfiles.shareTotalTokens,
      cost: userProfiles.shareTotalCostUsd,
      claimedAt: userProfiles.handleClaimedAt,
      visibility: userProfiles.usageVisibility,
      snapshotJson: userProfiles.snapshotJson,
    })
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.usageVisibility, "public"),
        isNotNull(userProfiles.handle),
        isNotNull(userProfiles.handleClaimedAt),
      ),
    );

  const tokenRows: RankedRow[] = [];
  const costRows: RankedRow[] = [];

  for (const row of rows) {
    if (!row.handle || !row.claimedAt) continue;
    const computerCount = extractShareTotals(row.snapshotJson, false).computer_count;
    const shared = {
      handle: row.handle,
      avatar_url: row.avatarUrl ?? null,
      github_username: row.githubUsername ?? null,
      x_username: row.xUsername ?? null,
      ...(computerCount ? { computer_count: computerCount } : {}),
    };
    if (typeof row.tokens === "number" && Number.isFinite(row.tokens)) {
      tokenRows.push({ ...shared, value: row.tokens });
    }
    if (typeof row.cost === "number" && Number.isFinite(row.cost)) {
      costRows.push({ ...shared, value: row.cost });
    }
  }

  const payload: LeaderboardPayload = {
    updated_at: Date.now(),
    tokens: buildBoard(tokenRows),
    cost: buildBoard(costRows),
  };

  const now = new Date();
  const existing = await db
    .select({ boardId: usageLeaderboards.boardId })
    .from(usageLeaderboards)
    .where(eq(usageLeaderboards.boardId, LEADERBOARD_CACHE_ID))
    .limit(1);

  if (existing[0]) {
    await db
      .update(usageLeaderboards)
      .set({
        payloadJson: JSON.stringify(payload),
        updatedAt: now,
      })
      .where(eq(usageLeaderboards.boardId, LEADERBOARD_CACHE_ID));
  } else {
    await db.insert(usageLeaderboards).values({
      boardId: LEADERBOARD_CACHE_ID,
      payloadJson: JSON.stringify(payload),
      updatedAt: now,
    });
  }

  return payload;
}

/** Rebuild only when the materialized cache is missing or older than 5 minutes. */
export async function refreshUsageLeaderboardsIfStale(
  db: HubDb,
  nowMs = Date.now(),
): Promise<"refreshed" | "skipped"> {
  const existing = await db
    .select({ updatedAt: usageLeaderboards.updatedAt })
    .from(usageLeaderboards)
    .where(eq(usageLeaderboards.boardId, LEADERBOARD_CACHE_ID))
    .limit(1);
  if (!shouldRefreshLeaderboardCache(cacheUpdatedAtMs(existing[0]?.updatedAt), nowMs)) {
    return "skipped";
  }
  await refreshUsageLeaderboards(db);
  return "refreshed";
}

export async function getUsageLeaderboards(
  db: HubDb,
  viewerHandle?: string | null,
): Promise<{
  updated_at: number | null;
  tokens: {
    total: number;
    entries: LeaderboardEntry[];
    viewer: LeaderboardEntry | null;
  };
  cost: {
    total: number;
    entries: LeaderboardEntry[];
    viewer: LeaderboardEntry | null;
  };
}> {
  let rows = await db
    .select()
    .from(usageLeaderboards)
    .where(eq(usageLeaderboards.boardId, LEADERBOARD_CACHE_ID))
    .limit(1);
  if (!rows[0]) {
    await refreshUsageLeaderboards(db);
    rows = await db
      .select()
      .from(usageLeaderboards)
      .where(eq(usageLeaderboards.boardId, LEADERBOARD_CACHE_ID))
      .limit(1);
  }
  const raw = rows[0]?.payloadJson;
  let payload: LeaderboardPayload | null = null;
  if (raw) {
    try {
      payload = JSON.parse(raw) as LeaderboardPayload;
    } catch {
      payload = null;
    }
  }

  const tokens = payload?.tokens ?? emptyBoard();
  const cost = payload?.cost ?? emptyBoard();
  const viewer = viewerHandle?.replace(/^@+/, "").toLowerCase() || null;

  return {
    updated_at: payload?.updated_at ?? null,
    tokens: {
      total: tokens.total,
      entries: tokens.entries,
      viewer: pickViewer(tokens, viewer),
    },
    cost: {
      total: cost.total,
      entries: cost.entries,
      viewer: pickViewer(cost, viewer),
    },
  };
}

function pickViewer(
  board: LeaderboardBoard,
  handle: string | null,
): LeaderboardEntry | null {
  if (!handle) return null;
  const inTop = board.entries.find((row) => row.handle === handle);
  if (inTop) return inTop;
  const found = board.ranks[handle];
  if (!found) return null;
  return {
    rank: found.rank,
    handle,
    avatar_url: null,
    github_username: null,
    x_username: null,
    value: found.value,
  };
}

export function jsonPublicNoStore(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}
