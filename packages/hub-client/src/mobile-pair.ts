import { requireHubBaseUrl } from "./config";
import { hubFetch } from "./http";

export type MobilePairCreateResponse = {
  pair_code: string;
  expires_at: number;
  expires_in_seconds: number;
  qr_value: string;
};

export type MobilePairClaimResponse = {
  device_id: string;
  device_credential: string;
  user_id: string;
  relay_synced?: boolean;
};

/** Desktop/Web: create a temporary QR pair code for the signed-in user. */
export async function hubCreateMobilePair(opts?: {
  label?: string;
}): Promise<MobilePairCreateResponse> {
  const res = await hubFetch("/v1/mobile-pair/create", {
    method: "POST",
    body: JSON.stringify({ label: opts?.label ?? "Mobile" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Create pair failed (${res.status})`);
  }
  return (await res.json()) as MobilePairCreateResponse;
}

/**
 * Mobile: claim a pair code (no Hub session required).
 * Optional `hubBase` overrides configured base URL (from QR payload).
 */
export async function hubClaimMobilePair(
  pairCode: string,
  opts?: { hubBase?: string },
): Promise<MobilePairClaimResponse> {
  const base = (opts?.hubBase?.trim() || requireHubBaseUrl()).replace(/\/$/, "");
  const res = await fetch(`${base}/v1/mobile-pair/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ pair_code: pairCode.trim() }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Pair claim failed (${res.status})`);
  }
  return (await res.json()) as MobilePairClaimResponse;
}

export function parseMobilePairScan(
  raw: string,
): { code: string; hub?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

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
    /* plain */
  }

  if (/^[a-f0-9]{32,}$/i.test(trimmed)) {
    return { code: trimmed };
  }
  return null;
}
