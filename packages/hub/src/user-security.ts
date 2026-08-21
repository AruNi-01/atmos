/**
 * Account linking and session housekeeping bound to Hub user_id.
 *
 * Linked accounts are readable with either Better Auth session cookie OR
 * device Bearer (desktop / phone) — both resolve to the same user_id.
 */
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import type { HubDb } from "./db/client";
import { account, session, user, verification } from "./db/schema";

/** Max concurrent browser sessions per Atmos user (oldest dropped first). */
export const MAX_USER_SESSIONS = 10;

export type LinkedAccountRow = {
  id: string;
  providerId: string;
  accountId: string;
  userId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  scopes: string[];
  /**
   * Provider profile email when known (id_token claim or provider userinfo).
   * Not the Atmos user.email (primary identity may differ after multi-link).
   */
  email: string | null;
};

/** Best-effort email from OIDC id_token payload (Google etc.). */
export function emailFromIdToken(idToken: string | null | undefined): string | null {
  if (!idToken || typeof idToken !== "string") return null;
  try {
    const parts = idToken.split(".");
    if (parts.length < 2 || !parts[1]) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    // Workers / Node: atob available in CF Worker; Bun has Buffer
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json) as { email?: string };
    const email = payload.email?.trim();
    return email || null;
  } catch {
    return null;
  }
}

export type LinkedAccountInternal = LinkedAccountRow & {
  accessToken: string | null;
  idToken: string | null;
};

export async function listLinkedAccounts(
  db: HubDb,
  userId: string,
): Promise<LinkedAccountInternal[]> {
  const rows = await db
    .select()
    .from(account)
    .where(eq(account.userId, userId));
  return rows.map((a) => ({
    id: a.id,
    providerId: a.providerId,
    accountId: a.accountId,
    userId: a.userId,
    createdAt: a.createdAt ?? null,
    updatedAt: a.updatedAt ?? null,
    scopes: a.scope ? a.scope.split(",").filter(Boolean) : [],
    // Per-provider email when id_token carries it (typical for Google).
    email: emailFromIdToken(a.idToken),
    accessToken: a.accessToken ?? null,
    idToken: a.idToken ?? null,
  }));
}

/** Public JSON (no tokens). */
export function publicLinkedAccount(
  row: LinkedAccountInternal | LinkedAccountRow,
): LinkedAccountRow {
  return {
    id: row.id,
    providerId: row.providerId,
    accountId: row.accountId,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    scopes: row.scopes,
    email: row.email,
  };
}

export async function unlinkLinkedAccount(
  db: HubDb,
  userId: string,
  opts: { providerId: string; accountId?: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const rows = await db
    .select()
    .from(account)
    .where(eq(account.userId, userId));
  if (rows.length <= 1) {
    return {
      ok: false,
      error: "cannot_unlink_last_account",
      status: 400,
    };
  }
  const match = rows.find((a) =>
    opts.accountId
      ? a.providerId === opts.providerId && a.accountId === opts.accountId
      : a.providerId === opts.providerId,
  );
  if (!match) {
    return { ok: false, error: "account_not_found", status: 404 };
  }
  await db.delete(account).where(eq(account.id, match.id));
  return { ok: true };
}

/**
 * Drop expired sessions, then if still over MAX_USER_SESSIONS, delete oldest
 * by createdAt (keep newest). Optionally never delete `keepToken` (current session).
 * Returns how many rows were deleted.
 */
export async function pruneUserSessions(
  db: HubDb,
  userId: string,
  opts?: { keepToken?: string; max?: number },
): Promise<number> {
  const max = opts?.max ?? MAX_USER_SESSIONS;
  const now = new Date();
  // Expired first
  await db
    .delete(session)
    .where(and(eq(session.userId, userId), lt(session.expiresAt, now)));

  const active = await db
    .select({
      id: session.id,
      token: session.token,
      createdAt: session.createdAt,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, now)))
    .orderBy(asc(session.createdAt));

  if (active.length <= max) return 0;

  // Prefer dropping oldest first; never drop keepToken if present.
  const keepToken = opts?.keepToken?.trim() || "";
  const overflow = active.length - max;
  const toDelete: string[] = [];
  for (const row of active) {
    if (toDelete.length >= overflow) break;
    if (keepToken && row.token === keepToken) continue;
    toDelete.push(row.id);
  }
  // If keepToken forced us to keep too many, drop remaining oldest including
  // anything except keepToken until size is max.
  if (active.length - toDelete.length > max) {
    for (const row of active) {
      if (active.length - toDelete.length <= max) break;
      if (keepToken && row.token === keepToken) continue;
      if (!toDelete.includes(row.id)) toDelete.push(row.id);
    }
  }

  if (toDelete.length === 0) return 0;
  await db.delete(session).where(inArray(session.id, toDelete));
  return toDelete.length;
}

// ---------------------------------------------------------------------------
// One-time link tickets: device Bearer proves user → open browser OAuth link
// without relying on a pre-existing Hub session cookie in that browser.
// ---------------------------------------------------------------------------

const LINK_TICKET_PREFIX = "link_ticket:";
const LINK_TICKET_TTL_MS = 5 * 60 * 1000;

function randomTicket(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createLinkTicket(
  db: HubDb,
  userId: string,
  email: string,
): Promise<{ ticket: string; expires_in: number }> {
  const ticket = randomTicket();
  const expiresAt = new Date(Date.now() + LINK_TICKET_TTL_MS);
  await db.insert(verification).values({
    id: `vt_${ticket}`,
    identifier: `${LINK_TICKET_PREFIX}${ticket}`,
    value: JSON.stringify({ userId, email }),
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { ticket, expires_in: Math.floor(LINK_TICKET_TTL_MS / 1000) };
}

export async function consumeLinkTicket(
  db: HubDb,
  ticket: string,
): Promise<{ userId: string; email: string } | null> {
  const trimmed = ticket.trim();
  if (!trimmed || trimmed.length < 16) return null;
  const identifier = `${LINK_TICKET_PREFIX}${trimmed}`;
  const rows = await db
    .select()
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // One-time: delete first
  await db.delete(verification).where(eq(verification.identifier, identifier));
  if (row.expiresAt.getTime() < Date.now()) return null;
  try {
    const parsed = JSON.parse(row.value) as { userId?: string; email?: string };
    if (!parsed.userId) return null;
    return {
      userId: parsed.userId,
      email: parsed.email ?? "",
    };
  } catch {
    return null;
  }
}

/** Drop expired verification rows (best-effort; shared table with Better Auth). */
export async function purgeExpiredLinkTickets(db: HubDb): Promise<void> {
  const now = new Date();
  await db.delete(verification).where(lt(verification.expiresAt, now));
}

/**
 * Hard-delete Atmos user and all rows referencing them (accounts, sessions,
 * devices, profiles, integrations, usage shares — via FK ON DELETE CASCADE).
 */
export async function deleteUserAndRelated(
  db: HubDb,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!rows[0]) {
    return { ok: false, error: "user_not_found", status: 404 };
  }
  await db.delete(user).where(eq(user.id, userId));
  return { ok: true };
}
