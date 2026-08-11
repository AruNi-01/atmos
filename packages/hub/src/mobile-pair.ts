/**
 * Temporary mobile pairing codes (QR / deep-link).
 *
 * Desktop/Web (signed-in) creates a one-time code. Mobile claims it without
 * OAuth and receives a Hub-minted device credential for the same user_id.
 * TTL: 3 minutes. Single use.
 */
import { and, eq, gt } from "drizzle-orm";
import type { HubDb } from "./db/client";
import { verification } from "./db/schema";
import { mintDevice } from "./devices";

export const MOBILE_PAIR_TTL_MS = 3 * 60 * 1000;
const ID_PREFIX = "mobile-pair:";

export type MobilePairStored = {
  user_id: string;
  label?: string | null;
};

export type MobilePairPayload = {
  /** Machine-readable QR / deep-link body. */
  qr_value: string;
  pair_code: string;
  expires_at: number;
  expires_in_seconds: number;
};

function randomPairCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build QR payload mobile can parse without a Hub session. */
export function buildMobilePairQrValue(opts: {
  pairCode: string;
  hubOrigin: string;
  expiresAt: number;
}): string {
  return JSON.stringify({
    t: "atmos-mobile-pair",
    v: 1,
    code: opts.pairCode,
    hub: opts.hubOrigin.replace(/\/$/, ""),
    exp: opts.expiresAt,
  });
}

export function parseMobilePairQrValue(
  raw: string,
): { code: string; hub?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Deep link: atmos://pair?code=… or atmos://pair/<code>
  if (/^atmos:/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const code =
        u.searchParams.get("code")?.trim() ||
        u.pathname.replace(/^\/+/, "").split("/")[0]?.trim() ||
        "";
      if (code.length >= 16) {
        return {
          code,
          hub: u.searchParams.get("hub")?.trim() || undefined,
        };
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const obj = JSON.parse(trimmed) as {
      t?: string;
      code?: string;
      hub?: string;
    };
    if (obj.t === "atmos-mobile-pair" && typeof obj.code === "string") {
      const code = obj.code.trim();
      if (code.length >= 16) {
        return {
          code,
          hub: typeof obj.hub === "string" ? obj.hub.trim() : undefined,
        };
      }
    }
  } catch {
    /* plain code */
  }

  if (/^[a-f0-9]{32,}$/i.test(trimmed)) {
    return { code: trimmed };
  }
  return null;
}

export async function createMobilePairCode(
  db: HubDb,
  userId: string,
  opts: { hubOrigin: string; label?: string | null },
): Promise<MobilePairPayload> {
  const pairCode = randomPairCode();
  const now = Date.now();
  const expiresAt = now + MOBILE_PAIR_TTL_MS;
  const stored: MobilePairStored = {
    user_id: userId,
    label: opts.label ?? "Mobile",
  };
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: `${ID_PREFIX}${pairCode}`,
    value: JSON.stringify(stored),
    expiresAt: new Date(expiresAt),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
  return {
    pair_code: pairCode,
    expires_at: Math.floor(expiresAt / 1000),
    expires_in_seconds: Math.floor(MOBILE_PAIR_TTL_MS / 1000),
    qr_value: buildMobilePairQrValue({
      pairCode,
      hubOrigin: opts.hubOrigin,
      expiresAt: Math.floor(expiresAt / 1000),
    }),
  };
}

export async function claimMobilePairCode(
  db: HubDb,
  pairCode: string,
): Promise<{
  device_id: string;
  device_credential: string;
  user_id: string;
  label: string;
} | null> {
  const trimmed = pairCode.trim();
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

  let stored: MobilePairStored;
  try {
    stored = JSON.parse(row.value) as MobilePairStored;
  } catch {
    return null;
  }
  if (!stored.user_id) return null;

  const label = (stored.label ?? "Mobile").trim() || "Mobile";
  const minted = await mintDevice(db, stored.user_id, { label });
  return {
    device_id: minted.device_id,
    device_credential: minted.device_credential,
    user_id: stored.user_id,
    label,
  };
}
