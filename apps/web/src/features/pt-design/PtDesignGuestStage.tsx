"use client";

import React from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { PtDesignApp, memoryPersistence } from "@atmos/pt-design";
import LogoSvg from "@workspace/ui/components/logo-svg";

const ATMOS_SITE_URL = "https://atmos.land";

/** Fullscreen board for hosted collab invites when no Atmos Computer is connected. */
export function PtDesignGuestStage() {
  const { resolvedTheme } = useTheme();
  const t = useTranslations("ptDesign.share");
  const tGuest = useTranslations("ptDesign.guest");
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const persistence = React.useMemo(() => memoryPersistence(), []);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
      data-testid="pt-design-guest"
      data-theme={theme}
    >
      <div className="relative z-0 min-h-0 flex-1">
        <div className="absolute inset-0">
          <PtDesignApp
            theme={theme}
            persistence={persistence}
            storageKey="pt-design:scene:guest"
            className="h-full min-h-0"
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
      </div>
      <a
        href={ATMOS_SITE_URL}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-4 right-4 z-20 rounded-md p-1 text-foreground/55 transition-colors hover:text-foreground"
        aria-label={tGuest("logoLink")}
        title={tGuest("logoLink")}
        data-testid="pt-design-guest-logo"
      >
        <LogoSvg className="h-7 w-auto" />
      </a>
    </div>
  );
}
