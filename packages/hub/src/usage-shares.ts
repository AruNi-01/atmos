import { and, eq, isNull } from "drizzle-orm";
import type { HubDb } from "./db/client";
import { usageShares, userProfiles } from "./db/schema";
import { redactSnapshot } from "./redaction";

function randomShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sh_${hex}`;
}

export async function createUsageShare(
  db: HubDb,
  userId: string,
  body: {
    visibility?: "unlisted" | "public";
    title?: string;
    include_cost?: boolean;
    period_start?: string;
    period_end?: string;
    snapshot: unknown;
  },
) {
  const includeCost = Boolean(body.include_cost);
  const snapshot = redactSnapshot(body.snapshot, { includeCost });
  const now = new Date();
  const shareId = randomShareId();
  const visibility = body.visibility === "public" ? "public" : "unlisted";

  await db.insert(usageShares).values({
    shareId,
    userId,
    visibility,
    title: body.title ?? null,
    periodStart: body.period_start ?? null,
    periodEnd: body.period_end ?? null,
    includeCost,
    snapshotJson: JSON.stringify(snapshot),
    schemaVersion: 1,
    publishedAt: now,
    updatedAt: now,
  });

  return {
    share_id: shareId,
    url: `https://atmos.land/s/${shareId}`,
    visibility,
    published_at: now.getTime(),
  };
}

export async function listUsageShares(db: HubDb, userId: string) {
  return db
    .select({
      shareId: usageShares.shareId,
      visibility: usageShares.visibility,
      title: usageShares.title,
      updatedAt: usageShares.updatedAt,
      publishedAt: usageShares.publishedAt,
      revokedAt: usageShares.revokedAt,
    })
    .from(usageShares)
    .where(eq(usageShares.userId, userId));
}

export async function getOwnerShare(db: HubDb, userId: string, shareId: string) {
  const rows = await db
    .select()
    .from(usageShares)
    .where(and(eq(usageShares.shareId, shareId), eq(usageShares.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateUsageShare(
  db: HubDb,
  userId: string,
  shareId: string,
  body: {
    visibility?: "unlisted" | "public";
    title?: string;
    include_cost?: boolean;
    snapshot?: unknown;
  },
) {
  const existing = await getOwnerShare(db, userId, shareId);
  if (!existing || existing.revokedAt) return null;

  const includeCost =
    body.include_cost !== undefined
      ? Boolean(body.include_cost)
      : existing.includeCost;
  const snapshotJson =
    body.snapshot !== undefined
      ? JSON.stringify(redactSnapshot(body.snapshot, { includeCost }))
      : existing.snapshotJson;

  const now = new Date();
  await db
    .update(usageShares)
    .set({
      visibility: body.visibility ?? existing.visibility,
      title: body.title !== undefined ? body.title : existing.title,
      includeCost,
      snapshotJson,
      updatedAt: now,
    })
    .where(eq(usageShares.shareId, shareId));

  return { share_id: shareId, updated_at: now.getTime() };
}

export async function revokeUsageShare(
  db: HubDb,
  userId: string,
  shareId: string,
): Promise<boolean> {
  const existing = await getOwnerShare(db, userId, shareId);
  if (!existing || existing.revokedAt) return false;
  await db
    .update(usageShares)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(usageShares.shareId, shareId));
  return true;
}

export async function getPublicShare(db: HubDb, shareId: string) {
  const rows = await db
    .select()
    .from(usageShares)
    .where(and(eq(usageShares.shareId, shareId), isNull(usageShares.revokedAt)))
    .limit(1);
  const share = rows[0];
  if (!share) return null;

  const profiles = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, share.userId))
    .limit(1);
  const profile = profiles[0];

  return {
    share_id: share.shareId,
    visibility: share.visibility,
    title: share.title,
    owner: profile
      ? { handle: profile.handle, display_name: null, avatar_url: null }
      : { handle: null, display_name: null, avatar_url: null },
    period_start: share.periodStart,
    period_end: share.periodEnd,
    include_cost: share.includeCost,
    snapshot: JSON.parse(share.snapshotJson),
    og_image_url: share.ogObjectKey
      ? `https://hub.atmos.land/v1/public/og/${share.ogObjectKey}`
      : null,
    published_at: share.publishedAt?.getTime?.() ?? share.publishedAt,
    updated_at: share.updatedAt?.getTime?.() ?? share.updatedAt,
    provenance: "local_aggregate_snapshot",
  };
}
