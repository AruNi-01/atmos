import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { user, userProfiles } from "../src/db/schema";
import type { HubDb } from "../src/db/client";
import {
  deleteUsagePage,
  getOwnerUsagePage,
  getPublicTok,
  handleMintUnlistedSecret,
  handleOwnerUsagePage,
  handlePublicTok,
  mintUnlistedSecretPlaintext,
  normalizeSharePayload,
  normalizeSocialUsername,
  putUsagePage,
  rotateUnlistedSecret,
  usagePageUrl,
  validateHandle,
} from "../src/usage-page";

function slimSnapshot(over?: Record<string, unknown>) {
  return {
    schema_version: 2,
    generated_at: 1_700_000_000_000,
    summary: {
      total_tokens: 1000,
      total_messages: 10,
      active_days: 2,
      range_start: "2026-01-01",
      range_end: "2026-01-02",
      client_count: 8,
      model_count: 12,
      mix: {
        input: 400,
        output: 300,
        cache_read: 200,
        cache_write: 50,
        reasoning: 50,
      },
    },
    by_client: [
      { id: "claude", total_tokens: 400, message_count: 4 },
      { id: "codex", total_tokens: 200, message_count: 2 },
    ],
    by_model: [
      {
        id: "opus",
        provider_id: "anthropic",
        total_tokens: 400,
        message_count: 4,
      },
    ],
    by_day: [
      {
        date: "2026-01-01",
        total_tokens: 600,
        message_count: 6,
        breakdown: {
          input: 200,
          output: 200,
          cache_read: 100,
          cache_write: 50,
          reasoning: 50,
        },
        agents: [
          { id: "claude", total_tokens: 400 },
          { id: "other", total_tokens: 200 },
        ],
        models: [
          { id: "opus", total_tokens: 400 },
          { id: "other", total_tokens: 200 },
        ],
      },
    ],
    ...over,
  };
}

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

async function seedUser(db: HubDb, id: string, image?: string | null) {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: false,
    image: image ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("validateHandle", () => {
  test("accepts builder-style slugs", () => {
    expect(validateHandle("builder")).toEqual({ ok: true, handle: "builder" });
    expect(validateHandle("@Alice_1")).toEqual({ ok: true, handle: "alice_1" });
  });

  test("rejects reserved, short, and invalid charset", () => {
    expect(validateHandle("admin").ok).toBe(false);
    expect(validateHandle("ab").ok).toBe(false);
    expect(validateHandle("Alice!").ok).toBe(false);
    const reserved = validateHandle("tok");
    expect(reserved.ok).toBe(false);
    if (!reserved.ok) expect(reserved.error).toBe("reserved_handle");
    expect(validateHandle("leaderboard").ok).toBe(false);
  });
});

describe("normalizeSocialUsername", () => {
  test("strips urls and at-signs", () => {
    expect(normalizeSocialUsername("https://x.com/@Alice/", "x")).toEqual({
      ok: true,
      username: "Alice",
    });
    expect(normalizeSocialUsername("github.com/foo-bar", "github")).toEqual({
      ok: true,
      username: "foo-bar",
    });
    expect(normalizeSocialUsername("", "x")).toEqual({
      ok: true,
      username: null,
    });
  });

  test("rejects invalid charset", () => {
    expect(normalizeSocialUsername("no spaces", "x").ok).toBe(false);
    expect(normalizeSocialUsername("-bad", "github").ok).toBe(false);
  });
});

describe("normalizeSharePayload", () => {
  test("allowlists and drops unknown / denied keys", () => {
    const out = normalizeSharePayload(
      {
        ...slimSnapshot(),
        prompt: "secret",
        path: "/tmp",
        extra: true,
      },
      { includeCost: false },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.snapshot.prompt).toBeUndefined();
    expect(out.snapshot.path).toBeUndefined();
    expect(out.snapshot.extra).toBeUndefined();
    expect(out.snapshot.schema_version).toBe(2);
  });

  test("strips cost unless included", () => {
    const without = normalizeSharePayload(
      slimSnapshot({
        summary: {
          ...slimSnapshot().summary,
          total_cost_usd: 12.5,
        },
      }),
      { includeCost: false },
    );
    expect(without.ok).toBe(true);
    if (without.ok) {
      expect(
        (without.snapshot.summary as { total_cost_usd?: number }).total_cost_usd,
      ).toBeUndefined();
    }
    const withCost = normalizeSharePayload(
      slimSnapshot({
        summary: {
          ...slimSnapshot().summary,
          total_cost_usd: 12.5,
        },
      }),
      { includeCost: true },
    );
    expect(withCost.ok).toBe(true);
    if (withCost.ok) {
      expect(
        (withCost.snapshot.summary as { total_cost_usd?: number }).total_cost_usd,
      ).toBe(12.5);
    }
  });

  test("rejects oversized snapshots", () => {
    const huge = normalizeSharePayload(
      slimSnapshot({
        by_day: Array.from({ length: 800 }, () => ({
          date: "2020-01-01",
          total_tokens: 1,
          message_count: 1,
          breakdown: {
            input: 1,
            output: 1,
            cache_read: 1,
            cache_write: 1,
            reasoning: 1,
          },
          agents: [{ id: "x".repeat(2000), total_tokens: 1 }],
          models: [{ id: "y".repeat(2000), total_tokens: 1 }],
        })),
      }),
      { includeCost: false },
    );
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error).toBe("snapshot_too_large");
  });
});

describe("usage page owner + public handlers", () => {
  test("PUT without auth is not this layer — owner helpers require userId", async () => {
    const db = createTestDb();
    await seedUser(db, "u1", "https://avatars.example/u1.png");
    const result = await putUsagePage(
      db,
      { userId: "u1", image: "https://avatars.example/u1.png" },
      {
        handle: "builder",
        visibility: "public",
        snapshot: slimSnapshot(),
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe("https://atmos.land/tok/@builder");
    expect(result.unlisted_secret).toBeNull();
  });

  test("handleOwnerUsagePage GET/PUT/DELETE drive the real HTTP wrappers", async () => {
    const db = createTestDb();
    await seedUser(db, "u1");
    const owner = { userId: "u1", image: null };

    const unauthorizedShape = await handleOwnerUsagePage(
      db,
      owner,
      new Request("https://hub.atmos.land/v1/me/usage-page", { method: "GET" }),
    );
    expect(unauthorizedShape.status).toBe(200);
    const empty = (await unauthorizedShape.json()) as { handle: string | null };
    expect(empty.handle).toBeNull();

    const put = await handleOwnerUsagePage(
      db,
      owner,
      new Request("https://hub.atmos.land/v1/me/usage-page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "alice",
          visibility: "public",
          snapshot: slimSnapshot(),
          github_username: "@alice",
          x_username: "",
        }),
      }),
    );
    expect(put.status).toBe(200);
    const published = (await put.json()) as { url: string; handle: string };
    expect(published.url).toBe("https://atmos.land/tok/@alice");

    const pub = await handlePublicTok(
      db,
      "@alice",
      new Request("https://hub.atmos.land/v1/public/tok/alice"),
    );
    expect(pub.status).toBe(200);
    expect(pub.headers.get("Cache-Control")).toContain("no-store");
    const body = (await pub.json()) as {
      handle: string;
      snapshot: { prompt?: unknown; schema_version: number };
      github_username: string | null;
      x_username: string | null;
    };
    expect(body.handle).toBe("alice");
    expect(body.snapshot.schema_version).toBe(2);
    expect(body.snapshot.prompt).toBeUndefined();
    expect(body.github_username).toBe("alice");
    expect(body.x_username).toBeNull();

    const del = await handleOwnerUsagePage(
      db,
      owner,
      new Request("https://hub.atmos.land/v1/me/usage-page", {
        method: "DELETE",
      }),
    );
    expect(del.status).toBe(200);
    const gone = await handlePublicTok(
      db,
      "alice",
      new Request("https://hub.atmos.land/v1/public/tok/alice"),
    );
    expect(gone.status).toBe(404);
    const goneBody = (await gone.json()) as { error: string };
    expect(goneBody.error).toBe("not_found");
  });

  test("claim once, unique, reserved, invalid", async () => {
    const db = createTestDb();
    await seedUser(db, "a");
    await seedUser(db, "b");

    const first = await putUsagePage(
      db,
      { userId: "a" },
      { handle: "alice", visibility: "public", snapshot: slimSnapshot() },
    );
    expect(first.ok).toBe(true);

    const rename = await putUsagePage(
      db,
      { userId: "a" },
      { handle: "bob", visibility: "public", snapshot: slimSnapshot() },
    );
    expect(rename.ok).toBe(false);
    if (!rename.ok) {
      expect(rename.error).toBe("handle_immutable");
      expect(rename.status).toBe(403);
    }

    const taken = await putUsagePage(
      db,
      { userId: "b" },
      { handle: "alice", visibility: "public", snapshot: slimSnapshot() },
    );
    expect(taken.ok).toBe(false);
    if (!taken.ok) {
      expect(taken.error).toBe("username_taken");
      expect(taken.status).toBe(409);
    }

    const reserved = await putUsagePage(
      db,
      { userId: "b" },
      { handle: "admin", visibility: "public", snapshot: slimSnapshot() },
    );
    expect(reserved.ok).toBe(false);
    if (!reserved.ok) expect(reserved.status).toBe(400);

    const short = await putUsagePage(
      db,
      { userId: "b" },
      { handle: "ab", visibility: "public", snapshot: slimSnapshot() },
    );
    expect(short.ok).toBe(false);

    const bad = await putUsagePage(
      db,
      { userId: "b" },
      { handle: "Alice!", visibility: "public", snapshot: slimSnapshot() },
    );
    expect(bad.ok).toBe(false);
  });

  test("unlisted requires k; missing and wrong match unknown 404", async () => {
    const db = createTestDb();
    await seedUser(db, "u1");
    const minted = await putUsagePage(
      db,
      { userId: "u1" },
      { handle: "secretive", visibility: "unlisted", snapshot: slimSnapshot() },
    );
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;
    expect(minted.unlisted_secret?.startsWith("k_")).toBe(true);

    const missing = await getPublicTok(db, "secretive", null);
    expect(missing).toBeNull();
    const wrong = await getPublicTok(db, "secretive", "k_deadbeef");
    expect(wrong).toBeNull();
    const ok = await getPublicTok(db, "secretive", minted.unlisted_secret);
    expect(ok?.handle).toBe("secretive");

    const missingRes = await handlePublicTok(
      db,
      "secretive",
      new Request("https://hub.atmos.land/v1/public/tok/secretive"),
    );
    const unknownRes = await handlePublicTok(
      db,
      "nosuch",
      new Request("https://hub.atmos.land/v1/public/tok/nosuch"),
    );
    expect(missingRes.status).toBe(404);
    expect(unknownRes.status).toBe(404);
    expect(await missingRes.json()).toEqual(await unknownRes.json());
  });

  test("update overwrites the same url", async () => {
    const db = createTestDb();
    await seedUser(db, "u1");
    const first = await putUsagePage(
      db,
      { userId: "u1" },
      {
        handle: "keep",
        visibility: "public",
        snapshot: slimSnapshot({ generated_at: 1 }),
      },
    );
    expect(first.ok).toBe(true);
    const second = await putUsagePage(
      db,
      { userId: "u1" },
      {
        visibility: "public",
        snapshot: slimSnapshot({ generated_at: 2 }),
      },
    );
    expect(second.ok).toBe(true);
    if (!second.ok || !first.ok) return;
    expect(second.url).toBe(first.url);
    const pub = await getPublicTok(db, "keep", null);
    expect((pub?.snapshot as { generated_at: number }).generated_at).toBe(2);

    const rows = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, "u1"));
    expect(rows).toHaveLength(1);
  });

  test("unpublish clears snapshot", async () => {
    const db = createTestDb();
    await seedUser(db, "u1");
    await putUsagePage(
      db,
      { userId: "u1" },
      { handle: "gone", visibility: "public", snapshot: slimSnapshot() },
    );
    expect(await deleteUsagePage(db, "u1")).toBe(true);
    expect(await getPublicTok(db, "gone", null)).toBeNull();
    const owner = await getOwnerUsagePage(db, "u1");
    expect(owner.visibility).toBe("off");
    const row = (
      await db.select().from(userProfiles).where(eq(userProfiles.userId, "u1"))
    )[0];
    expect(row?.snapshotJson).toBeNull();
  });

  test("rotate unlisted secret invalidates the old k", async () => {
    const db = createTestDb();
    await seedUser(db, "u1");
    const first = await putUsagePage(
      db,
      { userId: "u1" },
      { handle: "rot", visibility: "unlisted", snapshot: slimSnapshot() },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const rotated = await rotateUnlistedSecret(db, "u1");
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(await getPublicTok(db, "rot", first.unlisted_secret)).toBeNull();
    expect(await getPublicTok(db, "rot", rotated.unlisted_secret)).not.toBeNull();

    const http = await handleMintUnlistedSecret(db, { userId: "u1" });
    expect(http.status).toBe(200);
    const payload = (await http.json()) as { unlisted_secret: string };
    expect(payload.unlisted_secret.startsWith("k_")).toBe(true);
    expect(await getPublicTok(db, "rot", rotated.unlisted_secret)).toBeNull();
  });

  test("auto slug is not public until claimed", async () => {
    const db = createTestDb();
    await seedUser(db, "u1");
    await db.insert(userProfiles).values({
      userId: "u1",
      handle: "autogen",
      handleClaimedAt: null,
      usageVisibility: "public",
      snapshotJson: JSON.stringify(slimSnapshot()),
      updatedAt: new Date(),
    });
    expect(await getPublicTok(db, "autogen", null)).toBeNull();
  });

  test("keeps other residual when capping daily dims", () => {
    const named = Array.from({ length: 8 }, (_, i) => ({
      id: `a${i}`,
      total_tokens: 10,
    }));
    const out = normalizeSharePayload(
      slimSnapshot({
        by_day: [
          {
            date: "2026-01-01",
            total_tokens: 100,
            message_count: 1,
            breakdown: {
              input: 1,
              output: 1,
              cache_read: 0,
              cache_write: 0,
              reasoning: 0,
            },
            agents: [...named, { id: "other", total_tokens: 20 }],
            models: [{ id: "other", total_tokens: 20 }],
          },
        ],
      }),
      { includeCost: false },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const day = (out.snapshot.by_day as Array<{ agents: Array<{ id: string }> }>)[0]!;
    expect(day.agents.some((r) => r.id === "other")).toBe(true);
    expect(day.agents.filter((r) => r.id !== "other")).toHaveLength(5);
  });

  test("usagePageUrl is atmos.land", () => {
    expect(usagePageUrl("builder")).toBe("https://atmos.land/tok/@builder");
    expect(usagePageUrl("builder", "k_abc")).toBe(
      "https://atmos.land/tok/@builder?k=k_abc",
    );
    expect(mintUnlistedSecretPlaintext().startsWith("k_")).toBe(true);
  });
});
