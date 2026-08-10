/**
 * After Hub cookie login: ensure this machine has a device credential for the
 * current user (mint via POST /v1/devices if needed) and sync it to local disk
 * for Linear / Relay / local API. Sign-out clears this; re-login re-syncs.
 *
 * No user-facing "Trust device" — login implies identity for this client.
 */
import {
  clearStoredDeviceCredential,
  getStoredDeviceCredential,
  hubBaseUrl,
  hubEnrollAndStoreDevice,
  storeDeviceCredential,
} from "@/api/hub-client";
import { hubGetSession } from "@/api/hub-auth-client";
import { applyIdentityBearingComputerSettings } from "@/features/connection/lib/query-identity-lifecycle";
import { clearWebRelayClientCache } from "@/features/connection/lib/create-web-relay-client";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";

export type EnsureLocalHubDeviceResult =
  | { status: "ok"; device_id?: string; enrolled: boolean }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

async function meUserIdWithBearerOnly(
  credential: string,
): Promise<string | null> {
  const base = hubBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/v1/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${credential}` },
      // Do not send Hub cookies — verify device alone.
      credentials: "omit",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { user_id?: string };
    return body.user_id?.trim() || null;
  } catch {
    return null;
  }
}

async function syncDeviceToLocalRuntime(opts: {
  device_id: string;
  device_credential: string;
}): Promise<void> {
  try {
    const { saveComputerClientSettingsToDisk } = await import(
      "@/features/connection/lib/sync-computer-client-settings"
    );
    const st = useAtmosComputerStore.getState();
    await applyIdentityBearingComputerSettings({
      accessToken: opts.device_credential,
      accessTokenConfigured: true,
    });
    await saveComputerClientSettingsToDisk(
      opts.device_credential,
      st.relayUrl,
      st.relaySecretKey,
      opts.device_id,
    );
    clearWebRelayClientCache();
  } catch {
    /* local Computer API optional (pure web) */
    try {
      await applyIdentityBearingComputerSettings({
        accessToken: opts.device_credential,
        accessTokenConfigured: true,
      });
    } catch {
      /* ignore */
    }
  }
}

let ensureInFlight: Promise<EnsureLocalHubDeviceResult> | null = null;

/**
 * Ensure local device credential matches the browser Hub session user.
 * Requires cookie session to mint a new device when missing/mismatched.
 * Concurrent callers share one in-flight promise (login race safe).
 */
export async function ensureLocalHubDevice(): Promise<EnsureLocalHubDeviceResult> {
  if (ensureInFlight) return ensureInFlight;
  ensureInFlight = ensureLocalHubDeviceImpl().finally(() => {
    ensureInFlight = null;
  });
  return ensureInFlight;
}

async function ensureLocalHubDeviceImpl(): Promise<EnsureLocalHubDeviceResult> {
  if (!hubBaseUrl()) {
    return { status: "skipped", reason: "hub_not_configured" };
  }

  const session = await hubGetSession().catch(() => null);
  const sessionUserId = session?.user?.id?.trim() || "";
  if (!sessionUserId) {
    // Desktop device-only: credential already from OAuth bridge; nothing to mint.
    const existing = getStoredDeviceCredential()?.trim() || "";
    if (existing.length >= 32) {
      const uid = await meUserIdWithBearerOnly(existing);
      if (uid) {
        storeDeviceCredential({
          device_id: "device",
          device_credential: existing,
        });
        await syncDeviceToLocalRuntime({
          device_id: "device",
          device_credential: existing,
        });
        return { status: "ok", enrolled: false };
      }
    }
    return { status: "skipped", reason: "no_cookie_session" };
  }

  const existing = getStoredDeviceCredential()?.trim() || "";
  if (existing.length >= 32) {
    const deviceUserId = await meUserIdWithBearerOnly(existing);
    if (deviceUserId === sessionUserId) {
      storeDeviceCredential({
        device_id: "device",
        device_credential: existing,
      });
      await syncDeviceToLocalRuntime({
        device_id: "device",
        device_credential: existing,
      });
      return { status: "ok", enrolled: false };
    }
    // Credential belongs to another user (account switch) — replace.
    clearStoredDeviceCredential();
  }

  try {
    const label =
      typeof navigator !== "undefined"
        ? navigator.userAgent.slice(0, 64)
        : "web";
    // Enroll needs Hub cookie (requireSession on POST /v1/devices).
    const enrolled = await hubEnrollAndStoreDevice({ label });
    await syncDeviceToLocalRuntime({
      device_id: enrolled.device_id,
      device_credential: enrolled.device_credential,
    });
    return {
      status: "ok",
      device_id: enrolled.device_id,
      enrolled: true,
    };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "device_enroll_failed",
    };
  }
}
