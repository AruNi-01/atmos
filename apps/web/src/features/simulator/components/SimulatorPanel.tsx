"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { useSimulatorSession } from "../hooks/use-simulator-session";
import {
  formatDevicePreviewClipboard,
  loadDevicePreviewPrompt,
} from "../lib/device-preview-agent-prompt";
import "../simulator-guest.css";
import {
  iframeSrc,
  parseSimulatorDeviceMessage,
  SIMULATOR_AGENT_COPIED_MESSAGE,
  SIMULATOR_AGENT_COPY_MESSAGE,
  SIMULATOR_AGENT_LABELS_MESSAGE,
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
  const locale = useLocale();
  const session = useSimulatorSession({ workspaceId, active });
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const postAgentLabels = React.useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: SIMULATOR_AGENT_LABELS_MESSAGE,
        tooltip: t("agentCopyTooltip"),
        copied: t("agentCopied"),
      },
      "*",
    );
  }, [t]);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === SIMULATOR_STOP_MESSAGE) {
        void session.disconnect();
        return;
      }
      if (event.data?.type === SIMULATOR_AGENT_COPY_MESSAGE) {
        const source = event.source;
        void loadDevicePreviewPrompt(workspaceId)
          .then((prompt) =>
            navigator.clipboard.writeText(formatDevicePreviewClipboard(prompt)),
          )
          .then(() => {
            source.postMessage({ type: SIMULATOR_AGENT_COPIED_MESSAGE }, "*");
          })
          .catch(() => {});
        return;
      }
      const device = parseSimulatorDeviceMessage(event.data);
      if (!device) return;
      void session.start({ udid: device.udid, platform: device.platform });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [session.disconnect, session.start, workspaceId]);

  if (session.url && (session.phase === "ready" || session.phase === "starting" || session.phase === "downloading")) {
    return (
      <div className="relative h-full w-full min-h-0">
        <iframe
          ref={iframeRef}
          title={t("iframeTitle")}
          src={iframeSrc(session.url, session.udid ?? undefined, locale)}
          data-atmos-guest-iframe=""
          className="h-full w-full border-0 bg-background"
          allow="autoplay"
          onLoad={postAgentLabels}
        />
      </div>
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
      probe={session.probe}
      onStart={(platform) => {
        void session.start({ platform });
      }}
      onRetry={session.retry}
    />
  );
}
