"use client";

/**
 * Web OAuth return tab (new tab after GitHub/Google).
 *
 * The original Atmos tab stays open; this tab only finishes the redirect chain.
 * Notifies other tabs via BroadcastChannel. The user closes this tab or uses
 * Back to Atmos (desktop deep link, or web return_to).
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { hubGetSession } from "@/api/hub-auth-client";
import { ensureLocalHubDevice } from "@/features/connection/lib/ensure-local-hub-device";
import {
  OAuthCallbackReturnFooter,
  OAuthCallbackShell,
  parseOAuthCallbackProvider,
  type OAuthCallbackStatus,
} from "@/shared/components/oauth-callback-shell";
import { useOAuthCallbackReturn } from "@/shared/hooks/use-oauth-callback-return";
import {
  HUB_AUTH_DONE_CHANNEL,
  HUB_AUTH_DONE_MESSAGE,
} from "@/app/hub-auth/hub-auth-channel";

function HubAuthDoneInner() {
  const t = useTranslations("hubAuthDone");
  const params = useSearchParams();
  const provider = parseOAuthCallbackProvider(params.get("provider"));
  const { ctx: returnCtx, ready: returnReady } = useOAuthCallbackReturn(params);
  const [status, setStatus] = useState<OAuthCallbackStatus>("working");
  const [message, setMessage] = useState(() => t("working"));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Prefer confirming a Hub cookie session (sign-in). Account linking may
        // finish without a cookie visible to this origin (desktop link_ticket);
        // still notify the app tab so it can refetch /v1/me/accounts.
        const session = await hubGetSession().catch(() => null);
        if (cancelled) return;

        // Sign-in: auto mint/sync device credential for this user (no Trust UI).
        // Link-only flows still have a session; ensure is idempotent if already enrolled.
        if (session?.user?.id) {
          await ensureLocalHubDevice().catch(() => null);
        }
        if (cancelled) return;

        try {
          const bc = new BroadcastChannel(HUB_AUTH_DONE_CHANNEL);
          bc.postMessage({ type: HUB_AUTH_DONE_MESSAGE });
          bc.close();
        } catch {
          /* BroadcastChannel unavailable */
        }

        try {
          window.opener?.postMessage(
            { type: HUB_AUTH_DONE_MESSAGE },
            window.location.origin,
          );
        } catch {
          /* opener blocked */
        }

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
  }, [t]);

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

function HubAuthDoneFallback() {
  const t = useTranslations("hubAuthDone");
  return (
    <OAuthCallbackShell
      status="working"
      title={t("title")}
      message={t("working")}
    />
  );
}

export default function HubAuthDonePage() {
  return (
    <Suspense fallback={<HubAuthDoneFallback />}>
      <HubAuthDoneInner />
    </Suspense>
  );
}
