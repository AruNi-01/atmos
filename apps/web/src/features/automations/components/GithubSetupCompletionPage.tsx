"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@workspace/ui";
import { CheckCircle2, ExternalLink, Github, X } from "lucide-react";

export function GithubSetupCompletionPage({ locale }: { locale: string }) {
  const searchParams = useSearchParams();
  const connected = searchParams.get("github_setup") === "connected";
  const installationId = searchParams.get("installation_id");
  const query = searchParams.toString();
  const automationsHref = `/${locale}/automations${query ? `?${query}` : ""}`;

  React.useEffect(() => {
    if (!connected) {
      return;
    }
    const timeout = window.setTimeout(() => {
      window.close();
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [connected]);

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
              {connected ? "GitHub App connected" : "GitHub setup finished"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Return to the Atmos window where you started setup. The GitHub trigger form will refresh the installation list.
            </p>
            {installationId ? (
              <div className="mt-4 rounded-md border border-border bg-muted/25 px-3 py-2 font-mono text-xs text-muted-foreground">
                Installation {installationId}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="sm:flex-1" onClick={() => window.close()}>
            <X className="size-4" />
            Close tab
          </Button>
          <Button asChild type="button" variant="outline" className="sm:flex-1">
            <Link href={automationsHref}>
              <ExternalLink className="size-4" />
              Open web app
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
