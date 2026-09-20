"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { useSimulatorSession } from "../hooks/use-simulator-session";
import { useSimulatorInventory } from "../hooks/use-simulator-inventory";
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
  simulatorHelperReachable,
} from "../types";
import { useSimulatorRuntimeStore } from "../store/use-simulator-runtime-store";
import { SimulatorAppearanceControl } from "./SimulatorAppearanceControl";
import { SimulatorCameraControl } from "./SimulatorCameraControl";
import { SimulatorInventoryPanel } from "./SimulatorInventoryPanel";
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
  const rootRef = React.useRef<HTMLDivElement>(null);
  const connectionMode = useAtmosComputerStore((store) => store.connectionMode);
  const storePlatform = useSimulatorRuntimeStore((store) =>
    workspaceId ? store.platformByWorkspace[workspaceId] : undefined,
  );
  const helperReachable = simulatorHelperReachable(connectionMode);
  const relayBlocked = !helperReachable || session.reason === "not_desktop";
  const inventory = useSimulatorInventory({
    workspaceId,
    enabled: active && !relayBlocked,
  });
  const [inventoryCollapsed, setInventoryCollapsed] = React.useState(false);
  const userToggledInventory = React.useRef(false);

  const claimedPlatform =
    storePlatform ??
    inventory.devices.find((device) => device.udid === session.udid)?.platform ??
    null;
  const liveClaim = Boolean(session.url);
  const showIframe =
    Boolean(session.url) &&
    (session.phase === "ready" || session.phase === "starting" || session.phase === "downloading");

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
        if (!source) return;
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

  React.useEffect(() => {
    if (session.udid) inventory.setSelectedUdid(session.udid);
  }, [inventory.setSelectedUdid, session.udid]);

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (userToggledInventory.current) return;
      setInventoryCollapsed(width < 720);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (relayBlocked) {
    return (
      <SimulatorSetupCard
        reason={session.reason === "not_desktop" ? "not_desktop" : session.reason}
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

  const previewBody = showIframe ? (
    <iframe
      ref={iframeRef}
      title={t("iframeTitle")}
      src={iframeSrc(session.url!, session.udid ?? undefined, locale)}
      data-atmos-guest-iframe=""
      className="h-full w-full border-0 bg-background"
      allow="autoplay"
      onLoad={postAgentLabels}
    />
  ) : session.phase === "probing" ||
    session.phase === "downloading" ||
    session.phase === "starting" ? (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin" />
      <p>
        {session.phase === "downloading"
          ? t("downloading", { percent: downloadPercent(session.progress?.downloaded, session.progress?.total) })
          : session.phase === "probing"
            ? t("checking")
            : t("starting")}
      </p>
    </div>
  ) : (
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

  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full">
      <SimulatorInventoryPanel
        workspaceId={workspaceId}
        inventory={inventory}
        collapsed={inventoryCollapsed}
        onCollapsedChange={(next) => {
          userToggledInventory.current = true;
          setInventoryCollapsed(next);
        }}
        actionsEnabled={!relayBlocked}
        claimedUdid={session.udid}
        onPreview={(device) => session.start({ udid: device.udid, platform: device.platform })}
        onReleasedClaim={() => {
          void session.disconnect();
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {liveClaim ? (
          <div
            data-atmos-simulator-chrome=""
            aria-label={t("appearance")}
            className="flex shrink-0 flex-wrap items-start gap-4 border-b border-border px-3 py-2"
          >
            <SimulatorAppearanceControl workspaceId={workspaceId} enabled={liveClaim} />
            {claimedPlatform === "android" ? (
              <SimulatorCameraControl workspaceId={workspaceId} platform={claimedPlatform} />
            ) : null}
          </div>
        ) : null}
        <div className="relative min-h-0 min-w-0 flex-1">{previewBody}</div>
      </div>
    </div>
  );
}

function downloadPercent(downloaded: number | undefined, total: number | null | undefined): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round(((downloaded ?? 0) / total) * 100));
}
