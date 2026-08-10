"use client";

/**
 * Web OAuth return tab (new tab after GitHub/Google).
 *
 * The original Atmos tab stays open; this tab only finishes the redirect chain.
 * Notifies other tabs via BroadcastChannel, then closes after a 5s countdown.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { hubGetSession } from "@/api/hub-auth-client";
import { ensureLocalHubDevice } from "@/features/connection/lib/ensure-local-hub-device";

export const HUB_AUTH_DONE_CHANNEL = "atmos-hub-auth";
export const HUB_AUTH_DONE_MESSAGE = "hub-auth-done" as const;

const CLOSE_COUNTDOWN_SECONDS = 5;

type Status = "working" | "ok" | "error";

export default function HubAuthDonePage() {
  const t = useTranslations("hubAuthDone");
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState(() => t("working"));
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

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
  }, [t]);

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
      {status === "error" ? (
        <a
          href="/"
          className="text-sm text-foreground underline underline-offset-4"
        >
          {t("goHome")}
        </a>
      ) : null}
    </div>
  );
}
