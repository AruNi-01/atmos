/**
 * Public Token Usage leaderboards (tokens + cost).
 * Totals are written on publish; the visible top-30 cache refreshes every 2h.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import type { HubDb } from "./db/client";
import { usageLeaderboards, userProfiles } from "./db/schema";

export const LEADERBOARD_TOP_N = 30;
export const LEADERBOARD_CACHE_ID = "public_v1";

export type LeaderboardEntry = {
  rank: number;
  handle: string;
  avatar_url: string | null;
  github_username: string | null;
  x_username: string | null;
  value: number;
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
): { tokens: number | null; cost: number | null } {
  if (!snapshotJson) return { tokens: null, cost: null };
  try {
    const parsed = JSON.parse(snapshotJson) as {
      summary?: { total_tokens?: unknown; total_cost_usd?: unknown };
    };
    const tokens = parsed.summary?.total_tokens;
    const cost = parsed.summary?.total_cost_usd;
    return {
      tokens: typeof tokens === "number" && Number.isFinite(tokens) ? tokens : null,
      cost:
        includeCost && typeof cost === "number" && Number.isFinite(cost)
          ? cost
          : null,
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
    const shared = {
      handle: row.handle,
      avatar_url: row.avatarUrl ?? null,
      github_username: row.githubUsername ?? null,
      x_username: row.xUsername ?? null,
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
