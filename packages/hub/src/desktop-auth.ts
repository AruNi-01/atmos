/**
 * Desktop system-browser OAuth handoff (APP-056).
 *
 * Electron cannot read Hub session cookies set in Chrome/Safari. After OAuth,
 * Hub mints a short-lived one-time code (and a device credential) on the
 * Hub origin (cookies work), then redirects to the local Server loopback URL
 * with `?code=…`. The bridge page exchanges the code for the credential and
 * writes it to disk for Electron to pick up.
 */
import { and, eq, gt } from "drizzle-orm";
import type { HubDb } from "./db/client";
import { verification } from "./db/schema";
import { mintDevice } from "./devices";

const CODE_TTL_MS = 5 * 60 * 1000;
const ID_PREFIX = "desktop-auth:";

export type DesktopAuthPayload = {
  device_id: string;
  device_credential: string;
  user_id: string;
  email?: string | null;
  name?: string | null;
};

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Only loopback HTTP(S) return targets are allowed (local Atmos Server UI). */
export function isAllowedDesktopReturnTo(returnTo: string): boolean {
  try {
    const u = new URL(returnTo);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
      return false;
    }
    // Restrict path to our bridge landing (avoid open redirects into arbitrary local apps).
    if (!u.pathname.startsWith("/hub-auth/bridge")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Mobile deep-link return after system-browser OAuth
 * (`atmos://hub-auth/callback` or `atmos://hub-auth/callback?...`).
 */
export function isAllowedMobileReturnTo(returnTo: string): boolean {
  try {
    const u = new URL(returnTo);
    if (u.protocol !== "atmos:") return false;
    // URL parser: host may be "hub-auth" with path "/callback", or host empty with path "//hub-auth/callback"
    const host = u.hostname.toLowerCase();
    const path = u.pathname.replace(/^\/+/, "").toLowerCase();
    if (host === "hub-auth" && (path === "callback" || path === "" || path.startsWith("callback"))) {
      return true;
    }
    if (!host && (path === "hub-auth/callback" || path.startsWith("hub-auth/callback/"))) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Desktop loopback bridge or mobile deep link. */
export function isAllowedDeviceAuthReturnTo(returnTo: string): boolean {
  return isAllowedDesktopReturnTo(returnTo) || isAllowedMobileReturnTo(returnTo);
}

export async function createDesktopAuthCode(
  db: HubDb,
  session: { userId: string; email?: string | null; name?: string | null },
  label?: string,
): Promise<{ code: string; payload: DesktopAuthPayload }> {
  const minted = await mintDevice(db, session.userId, {
    label: label ?? "Desktop",
  });
  const code = randomCode();
  const payload: DesktopAuthPayload = {
    device_id: minted.device_id,
    device_credential: minted.device_credential,
    user_id: session.userId,
    email: session.email ?? null,
    name: session.name ?? null,
  };
  const now = Date.now();
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: `${ID_PREFIX}${code}`,
    value: JSON.stringify(payload),
    expiresAt: new Date(now + CODE_TTL_MS),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
  return { code, payload };
}

/** One-time consume. Returns null if missing/expired. */
export async function consumeDesktopAuthCode(
  db: HubDb,
  code: string,
): Promise<DesktopAuthPayload | null> {
  const trimmed = code.trim();
  if (!trimmed || trimmed.length < 16) return null;
  const identifier = `${ID_PREFIX}${trimmed}`;
  const now = new Date();
  const rows = await db
    .select()
    .from(verification)
    .where(
      and(
        eq(verification.identifier, identifier),
        gt(verification.expiresAt, now),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  await db.delete(verification).where(eq(verification.identifier, identifier));

  try {
    return JSON.parse(row.value) as DesktopAuthPayload;
  } catch {
    return null;
  }
}

export function appendCodeToReturnTo(returnTo: string, code: string): string {
  const u = new URL(returnTo);
  u.searchParams.set("code", code);
  return u.toString();
}
