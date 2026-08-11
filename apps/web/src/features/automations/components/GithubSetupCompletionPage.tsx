"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { OAuthCallbackShell } from "@/shared/components/oauth-callback-shell";

export function GithubSetupCompletionPage() {
  const t = useTranslations("github.setupCompletion");
  const searchParams = useSearchParams();
  const connected = searchParams.get("github_setup") === "connected";
  const installationId = searchParams.get("installation_id");

  return (
    <OAuthCallbackShell
      provider="github"
      status={connected ? "ok" : "working"}
      title={connected ? t("connectedTitle") : t("finishedTitle")}
      message={t("description")}
    >
      {installationId ? (
        <div className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
          {t("installation", { installationId })}
        </div>
      ) : null}
    </OAuthCallbackShell>
  );
}
