/**
 * Hub-owned third-party integrations (APP-057 Linear).
 * Sole credential store — no local dual path.
 */
import { and, eq } from "drizzle-orm";
import type { HubDb } from "./db/client";
import { userIntegrations } from "./db/schema";

export type LinearCredentialsPayload = {
  auth_method: "api_key" | "oauth";
  api_key?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  viewer_id?: string;
  viewer_name?: string;
  viewer_email?: string;
  connected_at?: string;
};

function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export async function upsertLinearIntegration(
  db: HubDb,
  userId: string,
  creds: LinearCredentialsPayload,
): Promise<{ provider: string; auth_method: string; viewer_name?: string }> {
  const now = new Date();
  const existing = await db
    .select()
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, userId),
        eq(userIntegrations.provider, "linear"),
      ),
    )
    .limit(1);

  const payload = {
    userId,
    provider: "linear",
    authMethod: creds.auth_method,
    credentialsJson: JSON.stringify(creds),
    viewerName: creds.viewer_name ?? null,
    viewerEmail: creds.viewer_email ?? null,
    updatedAt: now,
  };

  if (existing[0]) {
    await db
      .update(userIntegrations)
      .set(payload)
      .where(eq(userIntegrations.id, existing[0].id));
  } else {
    await db.insert(userIntegrations).values({
      id: randomId("int"),
      connectedAt: now,
      ...payload,
    });
  }

  return {
    provider: "linear",
    auth_method: creds.auth_method,
    viewer_name: creds.viewer_name,
  };
}

export async function getLinearIntegration(db: HubDb, userId: string) {
  const rows = await db
    .select()
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, userId),
        eq(userIntegrations.provider, "linear"),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const credentials = JSON.parse(
    row.credentialsJson,
  ) as LinearCredentialsPayload;
  return {
    provider: "linear" as const,
    auth_method: row.authMethod,
    credentials,
    viewer_name: row.viewerName,
    viewer_email: row.viewerEmail,
    connected_at: row.connectedAt?.getTime?.() ?? row.connectedAt,
  };
}

/** Public status without secrets. */
export async function getLinearIntegrationStatus(db: HubDb, userId: string) {
  const full = await getLinearIntegration(db, userId);
  if (!full) {
    return { connected: false as const };
  }
  return {
    connected: true as const,
    auth_method: full.auth_method,
    viewer_name: full.viewer_name,
    viewer_email: full.viewer_email,
    connected_at: full.connected_at,
  };
}

export async function deleteLinearIntegration(
  db: HubDb,
  userId: string,
): Promise<boolean> {
  const res = await db
    .delete(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, userId),
        eq(userIntegrations.provider, "linear"),
      ),
    );
  return true;
}
