"use client";

import { useTranslations } from "next-intl";
import { History, Timer } from "lucide-react";

import { LaunchpadPageTabs } from "@/shared/components/LaunchpadPageTabs";
import type { AutomationsListTab } from "@/shared/lib/nuqs/searchParams";

export function AutomationDashboardTabs({
  tab,
  onTabChange,
}: {
  tab: AutomationsListTab;
  onTabChange: (tab: AutomationsListTab) => void;
}) {
  const t = useTranslations("automation.listPanel.tabs");

  return (
    <LaunchpadPageTabs
      value={tab}
      onValueChange={(value) => {
        if (value === "automations" || value === "history") {
          onTabChange(value);
        }
      }}
      items={[
        { value: "automations", label: t("automations"), icon: Timer },
        { value: "history", label: t("history"), icon: History },
      ]}
    />
  );
}
