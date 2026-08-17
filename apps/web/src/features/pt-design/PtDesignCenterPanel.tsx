"use client";

import React from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { PtDesignApp, type PersistenceAdapter } from "@atmos/pt-design";
import { getRuntimeApiConfig, httpBase, isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";
import { httpDesignLibrary } from "./library-adapter";
import { ptDesignSceneStorageKey } from "./storage-key";
import { usePtDesignAgentBridge } from "./use-pt-design-agent-bridge";

function contextPersistence(contextId: string): PersistenceAdapter {
  const key = ptDesignSceneStorageKey(contextId);
  return {
    async load() {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { scene: Parameters<PersistenceAdapter["save"]>[0]["scene"] };
      } catch {
        return null;
      }
    },
    async save(input) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, JSON.stringify({ scene: input.scene }));
    },
  };
}

export function PtDesignCenterPanel({ contextId }: { contextId: string }) {
  const storageKey = ptDesignSceneStorageKey(contextId);
  const persistence = React.useMemo(() => contextPersistence(contextId), [contextId]);
  const { resolvedTheme } = useTheme();
  const t = useTranslations("ptDesign.share");
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const [collabServerUrl, setCollabServerUrl] = React.useState<string | undefined>();
  const library = React.useMemo(() => httpDesignLibrary(), []);
  const agentBridge = usePtDesignAgentBridge();
  React.useEffect(() => {
    if (isHostedAtmosOrigin()) return;
    void getRuntimeApiConfig().then((cfg) => {
      setCollabServerUrl(httpBase(cfg));
    });
  }, []);
  return (
    <div
      className="h-full min-h-0 w-full overflow-hidden bg-background text-foreground"
      data-testid="pt-design-center"
      data-context-id={contextId}
      data-theme={theme}
    >
      <PtDesignApp
        key={storageKey}
        theme={theme}
        persistence={persistence}
        storageKey={storageKey}
        className="h-full min-h-0"
        collabServerUrl={collabServerUrl}
        library={library}
        clientId={contextId}
        agentBridge={agentBridge}
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
    </div>
  );
}
