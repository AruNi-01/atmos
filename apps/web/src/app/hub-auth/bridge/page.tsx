"use client";

/**
 * OAuth return landing for desktop system-browser sign-in (APP-056).
 *
 * Flow:
 * 1. Desktop opens GitHub/Google OAuth in the OS default browser.
 * 2. Hub OAuth completes and redirects to
 *    `https://hub.atmos.land/v1/desktop-auth/complete?return_to=…/hub-auth/bridge`
 *    (Hub origin → session cookie works; device + one-time code minted).
 * 3. Hub 302s here with `?code=…`.
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

const CLOSE_COUNTDOWN_SECONDS = 5;

type Status = "working" | "ok" | "error";

function HubAuthBridgeInner() {
  const t = useTranslations("hubAuthBridge");
  const params = useSearchParams();
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState(() => t("working"));
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

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
        setSecondsLeft(CLOSE_COUNTDOWN_SECONDS);
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

  // Visible 5s countdown, then try to close the OAuth tab.
  useEffect(() => {
    if (status !== "ok" || secondsLeft === null) return;

    if (secondsLeft <= 0) {
      try {
        window.close();
      } catch {
        /* browsers may block close if not script-opened */
      }
      return;
    }

    const id = window.setTimeout(() => {
      setSecondsLeft((s) => (s === null ? null : s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [status, secondsLeft]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="text-base font-medium text-foreground">{t("title")}</p>
      <p
        className={
          status === "error"
            ? "max-w-md text-sm text-destructive"
            : status === "ok"
              ? "max-w-md text-sm text-emerald-600 dark:text-emerald-500"
              : "max-w-md text-sm text-muted-foreground"
        }
      >
        {message}
      </p>
      {status === "ok" && secondsLeft !== null && secondsLeft > 0 ? (
        <p className="max-w-md text-xs text-muted-foreground">
          {t("closingIn", { seconds: secondsLeft })}
        </p>
      ) : null}
      {status === "ok" && secondsLeft === 0 ? (
        <p className="max-w-md text-xs text-muted-foreground">{t("closeHint")}</p>
      ) : null}
    </div>
  );
}

function HubAuthBridgeFallback() {
  const t = useTranslations("hubAuthBridge");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
      {t("working")}
    </div>
  );
}

export default function HubAuthBridgePage() {
  return (
    <Suspense fallback={<HubAuthBridgeFallback />}>
      <HubAuthBridgeInner />
    </Suspense>
  );
}
