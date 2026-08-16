"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Scan } from "lucide-react";
import {
  SettingsGroupCard,
} from "@/features/settings/components/settings/SettingsGroupCard";
import { SettingsToggleRow } from "@/features/settings/components/settings/SettingsToggleRow";
import { BrowserCookiesSettingsCard } from "@/features/settings/components/BrowserCookiesSettingsCard";
import { useBrowserSettingsStore } from "@/features/settings/store/browser-settings-store";

export function BrowserSettingsSection() {
  const t = useTranslations("settings.browser");
  const [agentOpen, setAgentOpen] = useState(true);

  const loadBrowser = useBrowserSettingsStore((s) => s.loadSettings);
  const showAgentChrome = useBrowserSettingsStore((s) => s.showAgentChrome);
  const setShowAgentChrome = useBrowserSettingsStore((s) => s.setShowAgentChrome);

  useEffect(() => {
    void loadBrowser();
  }, [loadBrowser]);

  return (
    <div className="space-y-4">
      <SettingsGroupCard
        open={agentOpen}
        onOpenChange={setAgentOpen}
        icon={Scan}
        title={t("groups.agent.title")}
        description={t("groups.agent.description")}
      >
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
