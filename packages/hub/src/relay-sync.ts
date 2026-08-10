/**
 * Hub → Relay projection (APP-056).
 * Best-effort service call; Relay remains connection fabric only.
 */
import type { HubEnv } from "./env";

export async function projectDeviceToRelay(
  env: HubEnv,
  payload: {
    user_id: string;
    device_id: string;
    credential_hash: string;
    label?: string | null;
    revoked?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!env.RELAY_URL || !env.RELAY_HUB_SYNC_SECRET) {
    return { ok: true }; // no-op until Relay migration wired
  }
  try {
    const res = await fetch(`${env.RELAY_URL.replace(/\/$/, "")}/v1/internal/devices/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RELAY_HUB_SYNC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, error: `relay ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "relay sync failed" };
  }
}
