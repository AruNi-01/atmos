"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Github } from "lucide-react";

export function GithubSetupCompletionPage() {
  const t = useTranslations("github.setupCompletion");
  const searchParams = useSearchParams();
  const connected = searchParams.get("github_setup") === "connected";
  const installationId = searchParams.get("installation_id");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-md border border-border bg-background p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
            {connected ? (
              <CheckCircle2 className="size-5 text-emerald-500" />
            ) : (
              <Github className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-normal">
              {connected ? t("connectedTitle") : t("finishedTitle")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("description")}
            </p>
            {installationId ? (
              <div className="mt-4 rounded-md border border-border bg-muted/25 px-3 py-2 font-mono text-xs text-muted-foreground">
                {t("installation", { installationId })}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
