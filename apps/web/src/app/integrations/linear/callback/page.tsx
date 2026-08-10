"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { wsLinearApi } from "@/api/ws/linear-api";
import { selectLinearOauth } from "@/features/settings/lib/linear-local-keys";

/**
 * OAuth redirect target for Linear (APP-056).
 * Desktop loopback and web both land here with ?code=&state=.
 */
function LinearOAuthCallbackInner() {
  const params = useSearchParams();
  const t = useTranslations("settings.integrationsSection.linear.oauthCallback");
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState(() => t("working"));

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
    let cancelled = false;
    void (async () => {
      try {
        await wsLinearApi.oauthFinish(code, state);
        if (cancelled) return;
        await selectLinearOauth();
        setStatus("ok");
        setMessage(t("success"));
        // Desktop loopback may not have SPA navigation; try soft redirect.
        window.setTimeout(() => {
          try {
            window.location.href = "/";
          } catch {
            /* ignore */
          }
        }, 1200);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : t("finishFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, t]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p
        className={
          status === "error"
            ? "text-sm text-destructive"
            : status === "ok"
              ? "text-sm text-emerald-600"
              : "text-sm text-muted-foreground"
        }
      >
        {message}
      </p>
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
