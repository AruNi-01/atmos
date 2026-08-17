"use client";

import React from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { PtDesignApp, type PersistenceAdapter } from "@atmos/pt-design";
import { getRuntimeApiConfig, httpBase, isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";
import { httpDesignLibrary } from "./library-adapter";
import { usePtDesignAgentBridge } from "./use-pt-design-agent-bridge";

const PT_DESIGN_STORAGE_KEY = "pt-design:scene:global";

function globalPersistence(): PersistenceAdapter {
  return {
    async load() {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(PT_DESIGN_STORAGE_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { scene: Parameters<PersistenceAdapter["save"]>[0]["scene"] };
      } catch {
        return null;
      }
    },
    async save(input) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(PT_DESIGN_STORAGE_KEY, JSON.stringify({ scene: input.scene }));
    },
  };
}

export function PtDesignCenterPanel({ contextId }: { contextId: string }) {
  const persistence = React.useMemo(() => globalPersistence(), []);
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
        theme={theme}
        persistence={persistence}
        storageKey={PT_DESIGN_STORAGE_KEY}
        className="h-full min-h-0"
        collabServerUrl={collabServerUrl}
        library={library}
        agentBridge={agentBridge}
        shareCopy={{
          title: t("title"),
          nameLabel: t("nameLabel"),
          localTab: t("localTab"),
          inviteTab: t("inviteTab"),
          agentHint: t("agentHint"),
          copyPrompt: t("copyPrompt"),
          localNote: t("localNote"),
          linkLabel: t("linkLabel"),
          linkPlaceholder: t("linkPlaceholder"),
          copy: t("copy"),
          copied: t("copied"),
          invalidLink: t("invalidLink"),
          privacy: t("privacy"),
          stopHint: t("stopHint"),
          stop: t("stop"),
          startMenu: t("startMenu"),
          openMenu: t("openMenu"),
        }}
      />
    </div>
  );
}
