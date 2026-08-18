import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../src/db/schema";
import { usageLeaderboards, user } from "../src/db/schema";
import type { HubDb } from "../src/db/client";
import {
  extractShareTotals,
  getUsageLeaderboards,
  LEADERBOARD_CACHE_ID,
  LEADERBOARD_TOP_N,
  LEADERBOARD_WRITE_REFRESH_MIN_MS,
  refreshUsageLeaderboards,
  shouldRefreshLeaderboardCache,
} from "../src/usage-leaderboard";
import { putUsagePage } from "../src/usage-page";

function createTestDb(): HubDb {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
      handle TEXT,
      handle_changed_at INTEGER,
      handle_claimed_at INTEGER,
      primary_share_id TEXT,
      profile_public INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      github_username TEXT,
      x_username TEXT,
      usage_visibility TEXT NOT NULL DEFAULT 'off',
      unlisted_token_hash TEXT,
      include_cost INTEGER NOT NULL DEFAULT 0,
      snapshot_json TEXT,
      snapshot_updated_at INTEGER,
      share_total_tokens INTEGER,
      share_total_cost_usd REAL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX user_profiles_handle_uidx ON user_profiles(handle);
    CREATE TABLE usage_leaderboards (
      board_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema }) as unknown as HubDb;
}

async function seedUser(db: HubDb, id: string) {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function snapshot(tokens: number, cost?: number) {
  return {
    schema_version: 2,
    generated_at: 1,
    summary: {
      total_tokens: tokens,
      total_messages: 1,
      active_days: 1,
      range_start: "2026-01-01",
      range_end: "2026-01-01",
      client_count: 1,
      model_count: 1,
      ...(cost !== undefined ? { total_cost_usd: cost } : {}),
      mix: { input: 1, output: 0, cache_read: 0, cache_write: 0, reasoning: 0 },
    },
    by_client: [{ id: "claude", total_tokens: tokens, message_count: 1 }],
    by_model: [{ id: "opus", provider_id: "anthropic", total_tokens: tokens, message_count: 1 }],
    by_day: [],
  };
}

describe("shouldRefreshLeaderboardCache", () => {
  const now = 1_700_000_000_000;

  test("rebuilds when the cache is missing or older than 5 minutes", () => {
    expect(shouldRefreshLeaderboardCache(null, now)).toBe(true);
    expect(shouldRefreshLeaderboardCache(0, now)).toBe(true);
    expect(
      shouldRefreshLeaderboardCache(
        now - LEADERBOARD_WRITE_REFRESH_MIN_MS,
        now,
      ),
    ).toBe(true);
    expect(
      shouldRefreshLeaderboardCache(
        now - LEADERBOARD_WRITE_REFRESH_MIN_MS - 1,
        now,
      ),
    ).toBe(true);
  });

  test("skips when the cache is younger than 5 minutes", () => {
    expect(shouldRefreshLeaderboardCache(now, now)).toBe(false);
    expect(
      shouldRefreshLeaderboardCache(
        now - LEADERBOARD_WRITE_REFRESH_MIN_MS + 1,
        now,
      ),
    ).toBe(false);
  });
});

describe("extractShareTotals", () => {
  test("reads tokens and optional cost", () => {
    expect(extractShareTotals(JSON.stringify(snapshot(10, 2.5)), true)).toEqual({
      tokens: 10,
      cost: 2.5,
    });
    expect(extractShareTotals(JSON.stringify(snapshot(10, 2.5)), false)).toEqual({
      tokens: 10,
      cost: null,
    });
  });
});

describe("refreshUsageLeaderboards", () => {
  test("ranks public pages only; unlisted stays off the board", async () => {
    const db = createTestDb();
    await seedUser(db, "a");
    await seedUser(db, "b");
    await seedUser(db, "c");
    await putUsagePage(
      db,
      { userId: "a" },
      {
        handle: "alice",
        visibility: "public",
        github_username: "alice-gh",
        x_username: "alice_x",
        snapshot: snapshot(300, 9),
      },
    );
    await putUsagePage(
      db,
      { userId: "b" },
      {
        handle: "bob",
        visibility: "public",
        include_cost: true,
        snapshot: snapshot(100, 20),
      },
    );
    await putUsagePage(
      db,
      { userId: "c" },
      {
        handle: "cara",
        visibility: "unlisted",
        include_cost: true,
        snapshot: snapshot(999, 99),
      },
    );

    await refreshUsageLeaderboards(db);
    const board = await getUsageLeaderboards(db, "bob");
    expect(board.tokens.total).toBe(2);
    expect(board.tokens.entries[0]?.handle).toBe("alice");
    expect(board.tokens.entries[0]?.github_username).toBe("alice-gh");
    expect(board.tokens.entries[0]?.x_username).toBe("alice_x");
    expect(board.tokens.entries.map((e) => e.handle)).not.toContain("cara");
    expect(board.tokens.viewer?.handle).toBe("bob");
    expect(board.tokens.viewer?.rank).toBe(2);

    expect(board.cost.total).toBe(1);
    expect(board.cost.entries[0]?.handle).toBe("bob");
    expect(board.cost.entries[0]?.value).toBe(20);
  });

  test("empty cache builds on first public read", async () => {
    const db = createTestDb();
    await seedUser(db, "a");
    await putUsagePage(
      db,
      { userId: "a" },
      { handle: "alice", visibility: "public", snapshot: snapshot(50) },
    );
    const board = await getUsageLeaderboards(db, "alice");
    expect(board.tokens.entries[0]?.handle).toBe("alice");
    expect(board.tokens.viewer?.rank).toBe(1);
  });

  test("caps visible entries at 30 and still ranks the viewer", async () => {
    const db = createTestDb();
    for (let i = 0; i < 35; i++) {
      const id = `u${i}`;
      await seedUser(db, id);
      await putUsagePage(
        db,
        { userId: id },
        {
          handle: `user${i}`,
          visibility: "public",
          snapshot: snapshot(1000 - i),
        },
      );
    }
    await refreshUsageLeaderboards(db);
    const board = await getUsageLeaderboards(db, "user34");
    expect(board.tokens.entries).toHaveLength(LEADERBOARD_TOP_N);
    expect(board.tokens.total).toBe(35);
    expect(board.tokens.viewer?.rank).toBe(35);
    expect(board.tokens.viewer?.handle).toBe("user34");
    expect(board.tokens.entries.some((e) => e.handle === "user34")).toBe(false);
  });

  test("write-path updates skip a rebuild inside the 5 minute window", async () => {
    const db = createTestDb();
    await seedUser(db, "a");
    await seedUser(db, "b");
    await putUsagePage(
      db,
      { userId: "a" },
      { handle: "alice", visibility: "public", snapshot: snapshot(100) },
    );
    await putUsagePage(
      db,
      { userId: "b" },
      { handle: "bob", visibility: "public", snapshot: snapshot(200) },
    );

    let board = await getUsageLeaderboards(db);
    expect(board.tokens.entries.map((e) => e.handle)).toEqual(["alice"]);
    expect(board.tokens.entries[0]?.value).toBe(100);

    await putUsagePage(
      db,
      { userId: "a" },
      { visibility: "public", snapshot: snapshot(400) },
    );
    board = await getUsageLeaderboards(db);
    expect(board.tokens.entries.map((e) => e.handle)).toEqual(["alice"]);
    expect(board.tokens.entries[0]?.value).toBe(100);
  });

  test("write-path updates rebuild after the cache is older than 5 minutes", async () => {
    const db = createTestDb();
    await seedUser(db, "a");
    await seedUser(db, "b");
    await putUsagePage(
      db,
      { userId: "a" },
      { handle: "alice", visibility: "public", snapshot: snapshot(100) },
    );
    await putUsagePage(
      db,
      { userId: "b" },
      { handle: "bob", visibility: "public", snapshot: snapshot(200) },
    );

    await db
      .update(usageLeaderboards)
      .set({
        updatedAt: new Date(Date.now() - LEADERBOARD_WRITE_REFRESH_MIN_MS - 1),
      })
      .where(eq(usageLeaderboards.boardId, LEADERBOARD_CACHE_ID));

    await putUsagePage(
      db,
      { userId: "a" },
      { visibility: "public", snapshot: snapshot(400) },
    );

    const board = await getUsageLeaderboards(db);
    expect(board.tokens.entries.map((e) => e.handle)).toEqual(["alice", "bob"]);
    expect(board.tokens.entries[0]?.value).toBe(400);
  });
});
