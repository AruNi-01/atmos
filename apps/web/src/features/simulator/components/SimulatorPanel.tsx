"use client";

import { useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { useSimulatorSession } from "../hooks/use-simulator-session";
import "../simulator-guest.css";
import { iframeSrc } from "../types";
import { SimulatorSetupCard } from "./SimulatorSetupCard";

export function SimulatorPanel({
  workspaceId,
  active,
}: {
  workspaceId: string | null;
  active: boolean;
}) {
  const t = useTranslations("features.simulator");
  const session = useSimulatorSession({ workspaceId, active });

  if (session.phase === "ready" && session.url) {
    return (
      <iframe
        title={t("iframeTitle")}
        src={iframeSrc(session.url, session.udid ?? undefined)}
        data-atmos-guest-iframe=""
        className="h-full w-full border-0 bg-background"
        allow="autoplay"
      />
    );
  }

  if (
    session.phase === "probing" ||
    session.phase === "downloading" ||
    session.phase === "starting"
  ) {
    const total = session.progress?.total;
    const downloaded = session.progress?.downloaded ?? 0;
    const pct =
      total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
        <p>
          {session.phase === "downloading"
            ? t("downloading", { percent: pct ?? 0 })
            : session.phase === "probing"
              ? t("checking")
              : t("starting")}
        </p>
      </div>
    );
  }

  return (
    <SimulatorSetupCard
      reason={session.reason}
      error={session.error}
      action={session.action}
      onRetry={session.retry}
    />
  );
}
