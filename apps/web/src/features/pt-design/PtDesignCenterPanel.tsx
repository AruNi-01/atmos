"use client";

import React from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { PtDesignApp, localStoragePersistence, type PtDesignOpenMode } from "@atmos/pt-design";
import { AgentSurfaceIsland } from "@/shared/components/agent-surface-island";
import { getRuntimeApiConfig, httpBase, isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { httpDesignLibrary } from "./library-adapter";
import { hostMetaForContext } from "./lib/pt-design-overview";
import { PT_DESIGN_RUNTIME_ACTION_COMMAND } from "./lib/pt-design-agent-feed-labels";
import { ptDesignSceneStorageKey } from "./storage-key";
import { usePtDesignAgentBridge } from "./use-pt-design-agent-bridge";

function contextPersistence(contextId: string) {
  return localStoragePersistence(ptDesignSceneStorageKey(contextId));
}

export function PtDesignCenterPanel({
  contextId,
  openMode,
  onBack,
}: {
  contextId: string;
  openMode?: PtDesignOpenMode;
  onBack?: () => void;
}) {
  const storageKey = ptDesignSceneStorageKey(contextId);
  const persistence = React.useMemo(() => contextPersistence(contextId), [contextId]);
  const projects = useProjects();
  const documentMeta = React.useMemo(
    () => hostMetaForContext(contextId, projects, { openMode }),
    [contextId, openMode, projects],
  );
  const { resolvedTheme } = useTheme();
  const t = useTranslations("ptDesign.share");
  const tMode = useTranslations("ptDesign.mode");
  const tOverview = useTranslations("ptDesign.overview");
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const [collabServerUrl, setCollabServerUrl] = React.useState<string | undefined>();
  const library = React.useMemo(() => httpDesignLibrary(), []);
  const tIsland = useTranslations("ptDesign.agentIsland");
  const { bridge: agentBridge, feed, activity } = usePtDesignAgentBridge(contextId);
  const viewState = React.useSyncExternalStore(
    activity.subscribe,
    activity.getViewState,
    activity.getViewState,
  );
  const lastActivityAt = React.useSyncExternalStore(
    activity.subscribe,
    () => activity.getSnapshot()?.at ?? null,
    () => activity.getSnapshot()?.at ?? null,
  );
  React.useEffect(() => {
    if (isHostedAtmosOrigin()) return;
    void getRuntimeApiConfig().then((cfg) => {
      setCollabServerUrl(httpBase(cfg));
    });
  }, []);
  const onBoardAction = React.useCallback(
    (payload: {
      nodeId: string;
      event: "click" | "change";
      action: { type: "agent"; name: string };
    }) => {
      const requestId = crypto.randomUUID();
      feed.begin(requestId, PT_DESIGN_RUNTIME_ACTION_COMMAND, {
        nodeId: payload.nodeId,
        event: payload.event,
        name: payload.action.name,
      });
      feed.complete(requestId, true);
      activity.record(requestId, [payload.nodeId]);
    },
    [activity, feed],
  );
  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden bg-background text-foreground"
      data-testid="pt-design-center"
      data-context-id={contextId}
      data-theme={theme}
    >
      <PtDesignApp
        key={storageKey}
        theme={theme}
        persistence={persistence}
        storageKey={storageKey}
        documentMeta={documentMeta}
        className="h-full min-h-0"
        collabServerUrl={collabServerUrl}
        library={library}
        clientId={contextId}
        agentBridge={agentBridge}
        onAction={onBoardAction}
        modeLabels={{ edit: tMode("edit"), interact: tMode("interact") }}
        onBack={onBack}
        backLabel={onBack ? tOverview("back") : undefined}
        shareCopy={{
          title: t("title"),
          nameLabel: t("nameLabel"),
          agentTab: t("agentTab"),
          humanTab: t("humanTab"),
          agentHint: t("agentHint"),
          copyPrompt: t("copyPrompt"),
          linkLabel: t("linkLabel"),
          linkPlaceholder: t("linkPlaceholder"),
          copy: t("copy"),
          copied: t("copied"),
          invalidLink: t("invalidLink"),
          privacy: t("privacy"),
          stopHint: t("stopHint"),
          start: t("start"),
          stop: t("stop"),
          startMenu: t("startMenu"),
          openMenu: t("openMenu"),
        }}
      />
      <AgentSurfaceIsland
        acceptsCommands={Boolean(agentBridge)}
        feed={feed}
        viewState={viewState}
        lastActivityAt={lastActivityAt}
        copy={{
          workingAria: tIsland("working"),
          idleAria: tIsland("idle"),
          historyAria: tIsland("history"),
          openScreenshotPreview: tIsland("openScreenshotPreview"),
          screenshotPreviewAlt: tIsland("screenshotPreviewAlt"),
        }}
      />
    </div>
  );
}
