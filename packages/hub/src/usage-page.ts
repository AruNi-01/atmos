/**
 * APP-061 — one Token Usage page per user (vanity handle + slim snapshot).
 * Pure persist/normalize rules; HTTP wrappers return Response.
 */
import { eq } from "drizzle-orm";
import type { HubDb } from "./db/client";
import { userProfiles } from "./db/schema";
import {
  extractShareTotals,
  refreshUsageLeaderboardsIfStale,
} from "./usage-leaderboard";

export const USAGE_PAGE_PUBLIC_ORIGIN = "https://atmos.land";
export const MAX_SNAPSHOT_BYTES = 256 * 1024;
export const SHARE_TOP_N = 5;
export const MAX_SHARE_DAYS = 800;

export const RESERVED_HANDLES = new Set([
  "atmos",
  "admin",
  "tok",
  "leaderboard",
  "api",
  "s",
  "u",
  "me",
  "public",
  "www",
  "login",
  "auth",
  "settings",
  "support",
  "help",
  "about",
  "legal",
  "blog",
  "docs",
]);

export type UsageVisibility = "off" | "public" | "unlisted";

export type UsagePagePutBody = {
  handle?: string;
  visibility?: UsageVisibility;
  include_cost?: boolean;
  github_username?: string | null;
  x_username?: string | null;
  snapshot?: unknown;
};

export type UsagePageOwner = {
  userId: string;
  image?: string | null;
};

export function sanitizeAvatarUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function usagePageUrl(handle: string, k?: string | null): string {
  const base = `${USAGE_PAGE_PUBLIC_ORIGIN}/tok/@${handle}`;
  return k ? `${base}?k=${encodeURIComponent(k)}` : base;
}

export function normalizeHandleInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

export function validateHandle(
  raw: string,
): { ok: true; handle: string } | { ok: false; error: string } {
  const handle = normalizeHandleInput(raw);
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
    return { ok: false, error: "invalid_handle" };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { ok: false, error: "reserved_handle" };
  }
  return { ok: true, handle };
}

export function normalizeSocialUsername(
  raw: string | null | undefined,
  provider: "github" | "x",
): { ok: true; username: string | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, username: null };
  let value = String(raw).trim();
  if (!value) return { ok: true, username: null };
  value = value.replace(/^https?:\/\//i, "");
  value = value.replace(/^(www\.)?/i, "");
  if (provider === "github") {
    value = value.replace(/^github\.com\//i, "");
  } else {
    value = value.replace(/^(x\.com|twitter\.com)\//i, "");
  }
  value = value.replace(/^@+/, "").replace(/\/+$/, "").split("/")[0] ?? "";
  value = value.trim();
  if (!value) return { ok: true, username: null };
  const pattern =
    provider === "github" ? /^[A-Za-z0-9-]{1,39}$/ : /^[A-Za-z0-9_]{1,30}$/;
  if (!pattern.test(value)) {
    return { ok: false, error: "invalid_social_username" };
  }
  if (provider === "github" && (value.startsWith("-") || value.endsWith("-"))) {
    return { ok: false, error: "invalid_social_username" };
  }
  return { ok: true, username: value };
}

export function isUniqueViolation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /unique|constraint/i.test(msg);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export async function hashUnlistedSecret(secret: string): Promise<string> {
  return sha256Hex(secret);
}

export function mintUnlistedSecretPlaintext(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `k_${hex}`;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stripCost<T extends Record<string, unknown>>(row: T, includeCost: boolean): T {
  if (includeCost) return row;
  const out = { ...row };
  delete out.total_cost_usd;
  delete out.cost_usd;
  return out;
}

function normalizeRankRows(input: unknown, includeCost: boolean): unknown[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, SHARE_TOP_N).map((row) => {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return stripCost(
      {
        id: asString(r.id) || "unknown",
        total_tokens: asFiniteNumber(r.total_tokens),
        message_count: asFiniteNumber(r.message_count),
        ...(typeof r.provider_id === "string" && r.provider_id
          ? { provider_id: r.provider_id }
          : {}),
        ...(includeCost ? { total_cost_usd: asFiniteNumber(r.total_cost_usd) } : {}),
      },
      includeCost,
    );
  });
}

function normalizeDimRows(input: unknown, includeCost: boolean): unknown[] {
  if (!Array.isArray(input)) return [];
  const rows = input.filter((row) => row && typeof row === "object") as Array<
    Record<string, unknown>
  >;
  const other = rows.find((r) => asString(r.id) === "other");
  const named = rows.filter((r) => asString(r.id) !== "other").slice(0, SHARE_TOP_N);
  const kept = other ? [...named, other] : named;
  return kept.map((r) =>
    stripCost(
      {
        id: asString(r.id) || "unknown",
        total_tokens: asFiniteNumber(r.total_tokens),
        ...(includeCost ? { cost_usd: asFiniteNumber(r.cost_usd) } : {}),
      },
      includeCost,
    ),
  );
}

export type NormalizeSnapshotResult =
  | { ok: true; snapshot: Record<string, unknown>; bytes: number }
  | { ok: false; error: "invalid_snapshot" | "snapshot_too_large" };

export function normalizeSharePayload(
  input: unknown,
  opts: { includeCost: boolean },
): NormalizeSnapshotResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "invalid_snapshot" };
  }
  const raw = input as Record<string, unknown>;
  const summaryIn =
    raw.summary && typeof raw.summary === "object"
      ? (raw.summary as Record<string, unknown>)
      : {};
  const mixIn =
    summaryIn.mix && typeof summaryIn.mix === "object"
      ? (summaryIn.mix as Record<string, unknown>)
      : {};

  const daysIn = Array.isArray(raw.by_day) ? raw.by_day.slice(0, MAX_SHARE_DAYS) : [];
  const snapshot: Record<string, unknown> = {
    schema_version: 2,
    generated_at: asFiniteNumber(raw.generated_at, Date.now()),
    summary: stripCost(
      {
        total_tokens: asFiniteNumber(summaryIn.total_tokens),
        total_messages: asFiniteNumber(summaryIn.total_messages),
        active_days: asFiniteNumber(summaryIn.active_days),
        range_start:
          typeof summaryIn.range_start === "string" ? summaryIn.range_start : null,
        range_end: typeof summaryIn.range_end === "string" ? summaryIn.range_end : null,
        client_count: asFiniteNumber(summaryIn.client_count),
        model_count: asFiniteNumber(summaryIn.model_count),
        ...(opts.includeCost
          ? { total_cost_usd: asFiniteNumber(summaryIn.total_cost_usd) }
          : {}),
        mix: {
          input: asFiniteNumber(mixIn.input),
          output: asFiniteNumber(mixIn.output),
          cache_read: asFiniteNumber(mixIn.cache_read),
          cache_write: asFiniteNumber(mixIn.cache_write),
          reasoning: asFiniteNumber(mixIn.reasoning),
        },
      },
      opts.includeCost,
    ),
    by_client: normalizeRankRows(raw.by_client, opts.includeCost),
    by_model: normalizeRankRows(raw.by_model, opts.includeCost),
    by_day: daysIn.map((day) => {
      const d = day && typeof day === "object" ? (day as Record<string, unknown>) : {};
      const br =
        d.breakdown && typeof d.breakdown === "object"
          ? (d.breakdown as Record<string, unknown>)
          : {};
      return stripCost(
        {
          date: asString(d.date),
          total_tokens: asFiniteNumber(d.total_tokens),
          message_count: asFiniteNumber(d.message_count),
          ...(opts.includeCost
            ? { total_cost_usd: asFiniteNumber(d.total_cost_usd) }
            : {}),
          breakdown: {
            input: asFiniteNumber(br.input),
            output: asFiniteNumber(br.output),
            cache_read: asFiniteNumber(br.cache_read),
            cache_write: asFiniteNumber(br.cache_write),
            reasoning: asFiniteNumber(br.reasoning),
          },
          agents: normalizeDimRows(d.agents, opts.includeCost),
          models: normalizeDimRows(d.models, opts.includeCost),
        },
        opts.includeCost,
      );
    }),
  };

  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > MAX_SNAPSHOT_BYTES) {
    return { ok: false, error: "snapshot_too_large" };
  }
  return { ok: true, snapshot, bytes };
}

function json(data: unknown, status = 200, noStore = false): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(noStore ? { "Cache-Control": "private, no-store" } : {}),
    },
  });
}

export function publicNotFound(): Response {
  return json({ error: "not_found" }, 404, true);
}

export async function getOrCreateProfile(db: HubDb, userId: string) {
  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];
  const now = new Date();
  await db.insert(userProfiles).values({
    userId,
    handle: null,
    updatedAt: now,
    usageVisibility: "off",
    includeCost: false,
  });
  const created = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return created[0]!;
}

export function claimedHandleOf(profile: {
  handle: string | null;
  handleClaimedAt: Date | null;
}): string | null {
  if (!profile.handle || !profile.handleClaimedAt) return null;
  return profile.handle;
}

export async function getOwnerUsagePage(db: HubDb, userId: string) {
  const profile = await getOrCreateProfile(db, userId);
  const handle = claimedHandleOf(profile);
  return {
    handle,
    handle_claimed: Boolean(handle),
    visibility: (profile.usageVisibility ?? "off") as UsageVisibility,
    github_username: profile.githubUsername ?? null,
    x_username: profile.xUsername ?? null,
    include_cost: Boolean(profile.includeCost),
    url: handle ? usagePageUrl(handle) : null,
    has_unlisted_secret: Boolean(profile.unlistedTokenHash),
    updated_at: profile.snapshotUpdatedAt
      ? profile.snapshotUpdatedAt.getTime?.() ?? Number(profile.snapshotUpdatedAt)
      : null,
  };
}

async function rebuildPublicLeaderboard(db: HubDb): Promise<void> {
  try {
    await refreshUsageLeaderboardsIfStale(db);
  } catch (error) {
    console.error("[hub] usage leaderboard refresh failed", error);
  }
}

export async function putUsagePage(
  db: HubDb,
  owner: UsagePageOwner,
  body: UsagePagePutBody,
): Promise<
  | {
      ok: true;
      handle: string;
      url: string;
      visibility: UsageVisibility;
      unlisted_secret: string | null;
      updated_at: number;
    }
  | { ok: false; error: string; status: number }
> {
  const profile = await getOrCreateProfile(db, owner.userId);
  const includeCost = Boolean(body.include_cost);
  const visibility: UsageVisibility =
    body.visibility === "public" ||
    body.visibility === "unlisted" ||
    body.visibility === "off"
      ? body.visibility
      : ((profile.usageVisibility as UsageVisibility) ?? "off");

  const github =
    body.github_username === undefined
      ? { ok: true as const, username: profile.githubUsername ?? null }
      : normalizeSocialUsername(body.github_username, "github");
  if (!github.ok) return { ok: false, error: github.error, status: 400 };
  const x =
    body.x_username === undefined
      ? { ok: true as const, username: profile.xUsername ?? null }
      : normalizeSocialUsername(body.x_username, "x");
  if (!x.ok) return { ok: false, error: x.error, status: 400 };

  let handle = claimedHandleOf(profile);
  const now = new Date();

  const avatarUrl = sanitizeAvatarUrl(owner.image) ?? profile.avatarUrl ?? null;

  if (!handle) {
    const raw = body.handle ?? "";
    const checked = validateHandle(raw);
    if (!checked.ok) return { ok: false, error: checked.error, status: 400 };
    handle = checked.handle;
  } else if (body.handle != null && body.handle !== "") {
    const checked = validateHandle(body.handle);
    if (!checked.ok) return { ok: false, error: checked.error, status: 400 };
    if (checked.handle !== handle) {
      return { ok: false, error: "handle_immutable", status: 403 };
    }
  }

  if (visibility === "off") {
    try {
      await db
        .update(userProfiles)
        .set({
          handle,
          handleClaimedAt: profile.handleClaimedAt ?? now,
          githubUsername: github.username,
          xUsername: x.username,
          usageVisibility: "off",
          includeCost: false,
          snapshotJson: null,
          snapshotUpdatedAt: null,
          unlistedTokenHash: null,
          shareTotalTokens: null,
          shareTotalCostUsd: null,
          avatarUrl,
          updatedAt: now,
        })
        .where(eq(userProfiles.userId, owner.userId));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { ok: false, error: "username_taken", status: 409 };
      }
      throw error;
    }
    await rebuildPublicLeaderboard(db);
    return {
      ok: true,
      handle,
      url: usagePageUrl(handle),
      visibility: "off",
      unlisted_secret: null,
      updated_at: now.getTime(),
    };
  }

  if (body.snapshot === undefined && !profile.snapshotJson) {
    return { ok: false, error: "snapshot_required", status: 400 };
  }

  let snapshotJson = profile.snapshotJson;
  if (body.snapshot !== undefined) {
    const normalized = normalizeSharePayload(body.snapshot, { includeCost });
    if (!normalized.ok) {
      return {
        ok: false,
        error: normalized.error,
        status: normalized.error === "snapshot_too_large" ? 413 : 400,
      };
    }
    snapshotJson = JSON.stringify(normalized.snapshot);
  } else if (!includeCost && snapshotJson) {
    try {
      const parsed = JSON.parse(snapshotJson) as unknown;
      const normalized = normalizeSharePayload(parsed, { includeCost: false });
      if (normalized.ok) snapshotJson = JSON.stringify(normalized.snapshot);
    } catch {
      /* keep */
    }
  }

  let unlistedSecret: string | null = null;
  let unlistedHash = profile.unlistedTokenHash ?? null;
  if (visibility === "unlisted" && !unlistedHash) {
    unlistedSecret = mintUnlistedSecretPlaintext();
    unlistedHash = await hashUnlistedSecret(unlistedSecret);
  }
  if (visibility !== "unlisted") {
    unlistedHash = visibility === "public" ? unlistedHash : null;
  }

  const publicTotals =
    visibility === "public"
      ? extractShareTotals(snapshotJson, includeCost)
      : { tokens: null, cost: null };

  try {
    await db
      .update(userProfiles)
      .set({
        handle,
        handleClaimedAt: profile.handleClaimedAt ?? now,
        githubUsername: github.username,
        xUsername: x.username,
        usageVisibility: visibility,
        includeCost,
        snapshotJson,
        snapshotUpdatedAt: now,
        unlistedTokenHash: visibility === "unlisted" ? unlistedHash : null,
        shareTotalTokens: publicTotals.tokens,
        shareTotalCostUsd: publicTotals.cost,
        avatarUrl,
        updatedAt: now,
      })
      .where(eq(userProfiles.userId, owner.userId));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "username_taken", status: 409 };
    }
    throw error;
  }

  await rebuildPublicLeaderboard(db);
  return {
    ok: true,
    handle,
    url: usagePageUrl(handle),
    visibility,
    unlisted_secret: unlistedSecret,
    updated_at: now.getTime(),
  };
}

export async function deleteUsagePage(db: HubDb, userId: string): Promise<boolean> {
  const profile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!profile[0]) return false;
  await db
    .update(userProfiles)
    .set({
      usageVisibility: "off",
      snapshotJson: null,
      snapshotUpdatedAt: null,
      unlistedTokenHash: null,
      includeCost: false,
      shareTotalTokens: null,
      shareTotalCostUsd: null,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.userId, userId));
  await rebuildPublicLeaderboard(db);
  return true;
}

export async function rotateUnlistedSecret(
  db: HubDb,
  userId: string,
): Promise<{ ok: true; unlisted_secret: string } | { ok: false; error: string; status: number }> {
  const profile = await getOrCreateProfile(db, userId);
  if (profile.usageVisibility !== "unlisted" || !claimedHandleOf(profile)) {
    return { ok: false, error: "not_unlisted", status: 400 };
  }
  const secret = mintUnlistedSecretPlaintext();
  const hash = await hashUnlistedSecret(secret);
  await db
    .update(userProfiles)
    .set({
      unlistedTokenHash: hash,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.userId, userId));
  return { ok: true, unlisted_secret: secret };
}

export async function getPublicTok(
  db: HubDb,
  handleRaw: string,
  k: string | null,
): Promise<
  | {
      handle: string;
      avatar_url: string | null;
      github_username: string | null;
      x_username: string | null;
      visibility: "public" | "unlisted";
      include_cost: boolean;
      generated_at: number;
      snapshot: unknown;
    }
  | null
> {
  const handle = normalizeHandleInput(handleRaw);
  if (!handle) return null;
  const rows = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.handle, handle))
    .limit(1);
  const profile = rows[0];
  if (!profile?.handleClaimedAt || !profile.handle || !profile.snapshotJson) {
    return null;
  }
  const visibility = profile.usageVisibility;
  if (visibility !== "public" && visibility !== "unlisted") return null;

  if (visibility === "unlisted") {
    const secret = (k ?? "").trim();
    if (!secret || !profile.unlistedTokenHash) return null;
    const hash = await hashUnlistedSecret(secret);
    if (!timingSafeEqualHex(hash, profile.unlistedTokenHash)) return null;
  }

  let snapshot: unknown;
  try {
    snapshot = JSON.parse(profile.snapshotJson);
  } catch {
    return null;
  }
  const normalized = normalizeSharePayload(snapshot, {
    includeCost: Boolean(profile.includeCost),
  });
  if (!normalized.ok) return null;
  const generatedAt = asFiniteNumber(
    (normalized.snapshot as { generated_at?: number }).generated_at,
    profile.snapshotUpdatedAt?.getTime?.() ?? Date.now(),
  );

  return {
    handle: profile.handle,
    avatar_url: profile.avatarUrl ?? null,
    github_username: profile.githubUsername ?? null,
    x_username: profile.xUsername ?? null,
    visibility,
    include_cost: Boolean(profile.includeCost),
    generated_at: generatedAt,
    snapshot: normalized.snapshot,
  };
}

export async function handleOwnerUsagePage(
  db: HubDb,
  owner: UsagePageOwner,
  request: Request,
): Promise<Response> {
  if (request.method === "GET") {
    return json(await getOwnerUsagePage(db, owner.userId));
  }
  if (request.method === "DELETE") {
    await deleteUsagePage(db, owner.userId);
    return json({ ok: true });
  }
  if (request.method === "PUT") {
    const body = (await request.json().catch(() => ({}))) as UsagePagePutBody;
    const result = await putUsagePage(db, owner, body);
    if (!result.ok) {
      return json({ error: result.error }, result.status);
    }
    return json({
      handle: result.handle,
      url: result.url,
      visibility: result.visibility,
      unlisted_secret: result.unlisted_secret,
      updated_at: result.updated_at,
    });
  }
  return json({ error: "method_not_allowed" }, 405);
}

export async function handleMintUnlistedSecret(
  db: HubDb,
  owner: UsagePageOwner,
): Promise<Response> {
  const result = await rotateUnlistedSecret(db, owner.userId);
  if (!result.ok) return json({ error: result.error }, result.status);
  const page = await getOwnerUsagePage(db, owner.userId);
  return json({
    unlisted_secret: result.unlisted_secret,
    url: page.handle ? usagePageUrl(page.handle, result.unlisted_secret) : null,
  });
}

export async function handlePublicTok(
  db: HubDb,
  handle: string,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const data = await getPublicTok(db, handle, url.searchParams.get("k"));
  if (!data) return publicNotFound();
  return json(data, 200, true);
}
