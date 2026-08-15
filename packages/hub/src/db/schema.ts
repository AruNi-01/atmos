/**
 * Hub D1 schema (APP-056 + APP-057 integrations).
 * Better Auth tables: user / session / account / verification
 * Business: devices, usage_shares, user_profiles, user_integrations
 */
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Better Auth core (provider: sqlite, camelCase fields via drizzle adapter)
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_userId_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (t) => [index("account_userId_idx").on(t.userId)],
);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(
    sql`(cast(unixepoch('subsecond') * 1000 as integer))`,
  ),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(
    sql`(cast(unixepoch('subsecond') * 1000 as integer))`,
  ),
});

// ---------------------------------------------------------------------------
// Hub business tables (APP-056)
// ---------------------------------------------------------------------------

export const devices = sqliteTable(
  "devices",
  {
    deviceId: text("device_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialHash: text("credential_hash").notNull().unique(),
    label: text("label"),
    appDeviceId: text("app_device_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    rotatedAt: integer("rotated_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("idx_devices_user").on(t.userId)],
);

export const usageShares = sqliteTable(
  "usage_shares",
  {
    shareId: text("share_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    visibility: text("visibility").notNull().default("unlisted"),
    title: text("title"),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    includeCost: integer("include_cost", { mode: "boolean" })
      .notNull()
      .default(false),
    snapshotJson: text("snapshot_json").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    ogObjectKey: text("og_object_key"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("idx_usage_shares_user").on(t.userId, t.updatedAt)],
);

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Public vanity slug. Null until the user claims once (APP-061). */
    handle: text("handle"),
    handleChangedAt: integer("handle_changed_at", { mode: "timestamp_ms" }),
    handleClaimedAt: integer("handle_claimed_at", { mode: "timestamp_ms" }),
    primaryShareId: text("primary_share_id"),
    profilePublic: integer("profile_public", { mode: "boolean" })
      .notNull()
      .default(false),
    avatarUrl: text("avatar_url"),
    githubUsername: text("github_username"),
    xUsername: text("x_username"),
    usageVisibility: text("usage_visibility").notNull().default("off"),
    unlistedTokenHash: text("unlisted_token_hash"),
    includeCost: integer("include_cost", { mode: "boolean" })
      .notNull()
      .default(false),
    snapshotJson: text("snapshot_json"),
    snapshotUpdatedAt: integer("snapshot_updated_at", { mode: "timestamp_ms" }),
    shareTotalTokens: integer("share_total_tokens"),
    shareTotalCostUsd: real("share_total_cost_usd"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("user_profiles_handle_uidx").on(t.handle),
    index("idx_profiles_public_tokens").on(t.usageVisibility, t.shareTotalTokens),
    index("idx_profiles_public_cost").on(t.usageVisibility, t.shareTotalCostUsd),
  ],
);

/** Materialized public boards; rebuilt on a 2h cron. */
export const usageLeaderboards = sqliteTable("usage_leaderboards", {
  boardId: text("board_id").primaryKey(),
  payloadJson: text("payload_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Third-party product integrations (Linear, …) — sole credential store (no local dual). */
export const userIntegrations = sqliteTable(
  "user_integrations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    authMethod: text("auth_method").notNull(),
    credentialsJson: text("credentials_json").notNull(),
    viewerName: text("viewer_name"),
    viewerEmail: text("viewer_email"),
    connectedAt: integer("connected_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("user_integrations_user_provider_uidx").on(t.userId, t.provider),
    index("idx_user_integrations_user").on(t.userId),
  ],
);

export const hubSchema = {
  user,
  session,
  account,
  verification,
  devices,
  usageShares,
  userProfiles,
  userIntegrations,
  usageLeaderboards,
};
