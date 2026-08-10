"use client";

/**
 * OAuth / account-link error landing (app origin).
 *
 * Better Auth redirects here with ?error=code instead of Hub's built-in
 * /api/auth/error page (which "Go Home" to hub.atmos.land — wrong for users).
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

export const HUB_AUTH_DONE_CHANNEL = "atmos-hub-auth";
export const HUB_AUTH_DONE_MESSAGE = "hub-auth-done" as const;

const CLOSE_COUNTDOWN_SECONDS = 8;

function HubAuthErrorInner() {
  const t = useTranslations("hubAuthError");
  const params = useSearchParams();
  const code = (params.get("error") ?? params.get("code") ?? "").trim();
  const description = (params.get("error_description") ?? "").trim();

  const [secondsLeft, setSecondsLeft] = useState(CLOSE_COUNTDOWN_SECONDS);

  const title = t("title");
  const message = useMemo(() => {
    switch (code) {
      case "account_already_linked_to_different_user":
        return t("errors.accountAlreadyLinkedOtherUser");
      case "email_doesn't_match":
      case "email_doesnt_match":
        return t("errors.emailDoesNotMatch");
      case "unable_to_link_account":
        return t("errors.unableToLink");
      case "state_mismatch":
        return t("errors.stateMismatch");
      case "session_required":
        return t("errors.sessionRequired");
      default:
        return t("errors.generic");
    }
  }, [code, t]);

  useEffect(() => {
    // Notify original Atmos tab so Linked accounts can stop "waiting" state.
    try {
      const bc = new BroadcastChannel(HUB_AUTH_DONE_CHANNEL);
      bc.postMessage({ type: HUB_AUTH_DONE_MESSAGE, error: code || true });
      bc.close();
    } catch {
      /* ignore */
    }
    try {
      window.opener?.postMessage(
        { type: HUB_AUTH_DONE_MESSAGE, error: code || true },
        window.location.origin,
      );
    } catch {
      /* ignore */
    }
  }, [code]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      try {
        window.close();
      } catch {
        /* ignore */
      }
      return;
    }
    const id = window.setTimeout(
      () => setSecondsLeft((s) => s - 1),
      1000,
    );
    return () => window.clearTimeout(id);
  }, [secondsLeft]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="max-w-md text-sm text-destructive">{message}</p>
      {code ? (
        <p className="max-w-md font-mono text-xs text-muted-foreground">
          {t("codeLabel", { code })}
        </p>
      ) : null}
      {description ? (
        <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      ) : null}
      {code === "account_already_linked_to_different_user" ? (
        <p className="max-w-md text-sm text-muted-foreground">
          {t("errors.accountAlreadyLinkedOtherUserHint")}
        </p>
      ) : null}
      {secondsLeft > 0 ? (
        <p className="max-w-md text-xs text-muted-foreground">
          {t("closingIn", { seconds: secondsLeft })}
        </p>
      ) : (
        <p className="max-w-md text-xs text-muted-foreground">{t("closeHint")}</p>
      )}
      <Link
        href="/"
        className="text-sm text-foreground underline underline-offset-4"
      >
        {t("goHome")}
      </Link>
    </div>
  );
}

function HubAuthErrorFallback() {
  const t = useTranslations("hubAuthError");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
      {t("title")}
    </div>
  );
}

export default function HubAuthErrorPage() {
  return (
    <Suspense fallback={<HubAuthErrorFallback />}>
      <HubAuthErrorInner />
    </Suspense>
  );
}
