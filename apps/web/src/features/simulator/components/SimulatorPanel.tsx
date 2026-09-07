"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { useSimulatorSession } from "../hooks/use-simulator-session";
import "../simulator-guest.css";
import {
  iframeSrc,
  parseSimulatorDeviceMessage,
  SIMULATOR_STOP_MESSAGE,
} from "../types";
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
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === SIMULATOR_STOP_MESSAGE) {
        void session.disconnect();
        return;
      }
      const device = parseSimulatorDeviceMessage(event.data);
      if (!device) return;
      void session.start({ udid: device.udid, platform: device.platform });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [session.disconnect, session.start]);

  if (session.url && (session.phase === "ready" || session.phase === "starting" || session.phase === "downloading")) {
    return (
      <iframe
        ref={iframeRef}
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
