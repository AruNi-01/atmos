"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Scan } from "lucide-react";
import {
  SettingsGroupCard,
  SettingsGroupRow,
} from "@/features/settings/components/settings/SettingsGroupCard";
import { SettingsToggleRow } from "@/features/settings/components/settings/SettingsToggleRow";
import { BrowserCookiesSettingsCard } from "@/features/settings/components/BrowserCookiesSettingsCard";
import { useBrowserSettingsStore } from "@/features/settings/store/browser-settings-store";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";

export function BrowserSettingsSection() {
  const t = useTranslations("settings.browser");
  const [agentOpen, setAgentOpen] = useState(true);

  const loadBrowser = useBrowserSettingsStore((s) => s.loadSettings);
  const defaultSurface = useBrowserSettingsStore((s) => s.defaultSurface);
  const setDefaultSurface = useBrowserSettingsStore((s) => s.setDefaultSurface);
  const showAgentChrome = useBrowserSettingsStore((s) => s.showAgentChrome);
  const setShowAgentChrome = useBrowserSettingsStore((s) => s.setShowAgentChrome);

  const loadLayout = useLayoutSettingsStore((s) => s.loadSettings);
  const setRightSidebarShowBrowser = useLayoutSettingsStore(
    (s) => s.setRightSidebarShowBrowser,
  );

  useEffect(() => {
    void loadBrowser();
    void loadLayout();
  }, [loadBrowser, loadLayout]);

  return (
    <div className="space-y-4">
      <SettingsGroupCard
        open={agentOpen}
        onOpenChange={setAgentOpen}
        icon={Scan}
        title={t("groups.agent.title")}
        description={t("groups.agent.description")}
      >
        <SettingsGroupRow
          title={t("defaultSurface.title")}
          description={t("defaultSurface.description")}
          wide
        >
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={defaultSurface}
            onChange={(event) => {
              const next = event.target.value === "center" ? "center" : "sidebar";
              if (next === "sidebar") {
                void setRightSidebarShowBrowser(true);
              }
              void setDefaultSurface(next);
            }}
          >
            <option value="sidebar">{t("defaultSurface.sidebar")}</option>
            <option value="center">{t("defaultSurface.center")}</option>
          </select>
        </SettingsGroupRow>
        <SettingsToggleRow
          title={t("agentChrome.title")}
          description={t("agentChrome.description")}
          checked={showAgentChrome}
          onCheckedChange={(value) => void setShowAgentChrome(value)}
        />
      </SettingsGroupCard>

      <BrowserCookiesSettingsCard />
    </div>
  );
}
