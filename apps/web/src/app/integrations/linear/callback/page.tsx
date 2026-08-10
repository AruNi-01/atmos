"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { wsLinearApi } from "@/api/ws/linear-api";
import { selectLinearOauth } from "@/features/settings/lib/linear-local-keys";

/**
 * OAuth codes are single-use. React Strict Mode remounts effects in dev; a module-level
 * in-flight map reuses one finish promise across remounts so we never double-exchange
 * (Linear `invalid_grant`) while still updating UI after the remount.
 */
const oauthFinishInflight = new Map<string, Promise<void>>();

/** Seconds shown after success before we try `window.close()`. */
const SUCCESS_CLOSE_SECONDS = 5;

/**
 * OAuth redirect target for Linear (APP-056).
 * Desktop loopback and web both land here with ?code=&state=.
 */
function LinearOAuthCallbackInner() {
  const params = useSearchParams();
  const t = useTranslations("settings.integrationsSection.linear.oauthCallback");
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState(() => t("working"));
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    if (error) {
      setStatus("error");
      setMessage(error);
      return;
    }
    if (!code || !state) {
      setStatus("error");
      setMessage(t("missingParams"));
      return;
    }
    const finishKey = `${state}:${code}`;
    let cancelled = false;

    let finish = oauthFinishInflight.get(finishKey);
    if (!finish) {
      finish = (async () => {
        await wsLinearApi.oauthFinish(code, state);
        await selectLinearOauth();
      })();
      oauthFinishInflight.set(finishKey, finish);
    }

    void finish
      .then(() => {
        if (cancelled) return;
        setStatus("ok");
        setMessage(t("success"));
        setCountdown(SUCCESS_CLOSE_SECONDS);
      })
      .catch((e: unknown) => {
        // Allow a manual retry after a real failure (reload with same params).
        oauthFinishInflight.delete(finishKey);
        if (cancelled) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : t("finishFailed"));
      });

    return () => {
      cancelled = true;
    };
  }, [params, t]);

  // Success countdown → best-effort close (works when opened via window.open).
  useEffect(() => {
    if (status !== "ok" || countdown === null) return;
    if (countdown <= 0) {
      try {
        window.close();
      } catch {
        /* ignore — user can close manually */
      }
      return;
    }
    const id = window.setTimeout(() => {
      setCountdown((n) => (n === null ? null : n - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [status, countdown]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p
        className={
          status === "error"
            ? "text-sm text-destructive"
            : status === "ok"
              ? "text-sm font-medium text-emerald-600"
              : "text-sm text-muted-foreground"
        }
      >
        {message}
      </p>
      {status === "ok" && countdown !== null ? (
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm text-muted-foreground">
            {countdown > 0
              ? t("closeCountdown", { seconds: countdown })
              : t("closeNow")}
          </p>
          <p className="text-xs text-muted-foreground/80">{t("closeHint")}</p>
        </div>
      ) : null}
    </div>
  );
}

function LinearOAuthCallbackFallback() {
  const t = useTranslations("settings.integrationsSection.linear.oauthCallback");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
      {t("loading")}
    </div>
  );
}

export default function LinearOAuthCallbackPage() {
  return (
    <Suspense fallback={<LinearOAuthCallbackFallback />}>
      <LinearOAuthCallbackInner />
    </Suspense>
  );
}
