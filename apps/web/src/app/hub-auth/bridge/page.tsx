"use client";

/**
 * OAuth return landing for desktop system-browser sign-in (APP-056).
 *
 * Flow:
 * 1. Desktop opens GitHub/Google OAuth in the OS default browser.
 * 2. Hub OAuth completes and redirects to
 *    `https://hub.atmos.land/v1/desktop-auth/complete?return_to=…/hub-auth/bridge`
 *    (Hub origin → session cookie works; device + one-time code minted).
 * 3. Hub 302s here with `?code=…` (and optional `provider=` for UI chrome).
 * 4. This page exchanges the code (no cookies needed), writes
 *    `device_credential` to the local Atmos Server on disk.
 * 5. Electron UI polls that file and becomes signed in.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { hubBaseUrl, storeDeviceCredential } from "@/api/hub-client";
import { saveComputerClientSettingsToDisk } from "@/features/connection/lib/sync-computer-client-settings";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import {
  OAuthCallbackReturnFooter,
  OAuthCallbackShell,
  parseOAuthCallbackProvider,
  type OAuthCallbackStatus,
} from "@/shared/components/oauth-callback-shell";
import { useOAuthCallbackReturn } from "@/shared/hooks/use-oauth-callback-return";

function HubAuthBridgeInner() {
  const t = useTranslations("hubAuthBridge");
  const params = useSearchParams();
  const provider = parseOAuthCallbackProvider(params.get("provider"));
  const { ctx: returnCtx, ready: returnReady } = useOAuthCallbackReturn(params);
  const [status, setStatus] = useState<OAuthCallbackStatus>("working");
  const [message, setMessage] = useState(() => t("working"));

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      setStatus("error");
      setMessage(t("missingCode"));
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const base = hubBaseUrl();
        if (!base) {
          throw new Error("Hub is not configured");
        }
        const res = await fetch(`${base}/v1/desktop-auth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Exchange failed (${res.status})`);
        }
        const body = (await res.json()) as {
          device_id: string;
          device_credential: string;
          user_id: string;
        };
        if (!body.device_credential || body.device_credential.length < 32) {
          throw new Error("Invalid device credential from Hub");
        }

        // Best-effort localStorage (system browser) — Electron uses disk.
        try {
          storeDeviceCredential({
            device_id: body.device_id,
            device_credential: body.device_credential,
          });
        } catch {
          /* ignore */
        }

        const st = useAtmosComputerStore.getState();
        await saveComputerClientSettingsToDisk(
          body.device_credential,
          st.relayUrl,
          st.relaySecretKey,
          body.device_id,
        );

        if (cancelled) return;
        setStatus("ok");
        setMessage(t("success"));
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : t("failed"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, t]);

  return (
    <OAuthCallbackShell
      provider={provider}
      status={status}
      title={t("title")}
      message={message}
    >
      {status === "ok" || status === "error" ? (
        <OAuthCallbackReturnFooter
          ctx={returnCtx}
          closeHint={t("closeHint")}
          backLabel={t("backToAtmos")}
          showAction={returnReady}
        />
      ) : null}
    </OAuthCallbackShell>
  );
}

function HubAuthBridgeFallback() {
  const t = useTranslations("hubAuthBridge");
  return (
    <OAuthCallbackShell
      status="working"
      title={t("title")}
      message={t("working")}
    />
  );
}

export default function HubAuthBridgePage() {
  return (
    <Suspense fallback={<HubAuthBridgeFallback />}>
      <HubAuthBridgeInner />
    </Suspense>
  );
}
