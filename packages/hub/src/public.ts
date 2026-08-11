import type { HubDb } from "./db/client";
import { getPublicShare } from "./usage-shares";
import { eq } from "drizzle-orm";
import { userProfiles } from "./db/schema";

export async function publicShareJson(db: HubDb, shareId: string) {
  return getPublicShare(db, shareId);
}

export async function publicProfileJson(db: HubDb, handle: string) {
  const rows = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.handle, handle))
    .limit(1);
  const profile = rows[0];
  if (!profile || !profile.profilePublic) return null;
  return {
    handle: profile.handle,
    primary_share_id: profile.primaryShareId,
    profile_public: true,
  };
}
