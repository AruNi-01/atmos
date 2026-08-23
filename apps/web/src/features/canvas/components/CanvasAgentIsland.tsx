"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { AgentSurfaceIsland } from "@/shared/components/agent-surface-island";
import type { CanvasAgentBridgeState } from "../hooks/use-canvas-agent-bridge";
import type { CanvasAgentViewState } from "../lib/canvas-agent-activity";

export function CanvasAgentIsland({ bridge }: { bridge: CanvasAgentBridgeState }) {
  const t = useTranslations("Canvas.chrome");
  const viewState = useAgentViewState(bridge.activity);
  const lastActivityAt = useAgentLastActivityAt(bridge.activity);

  return (
    <AgentSurfaceIsland
      acceptsCommands={bridge.acceptsCommands}
      feed={bridge.feed}
      viewState={{ inflight: viewState.inflight, session: viewState.session }}
      lastActivityAt={lastActivityAt}
      copy={{
        workingAria: t("agentIsland.agentWorkingOnCanvas"),
        idleAria: t("agentIsland.canvasAgentActivity"),
        historyAria: t("agentIsland.canvasAgentActivityHistory"),
        openScreenshotPreview: t("agentIsland.openScreenshotPreview"),
        screenshotPreviewAlt: t("agentIsland.screenshotPreviewAlt"),
      }}
    />
  );
}

function useAgentLastActivityAt(store: CanvasAgentBridgeState["activity"]): number | null {
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot()?.at ?? null,
    () => store.getSnapshot()?.at ?? null,
  );
}

function useAgentViewState(store: CanvasAgentBridgeState["activity"]): CanvasAgentViewState {
  return React.useSyncExternalStore(store.subscribe, store.getViewState, store.getViewState);
}
