"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe, LayoutTemplate, Link2, Scan, Download } from "lucide-react";
import { Input, Switch } from "@workspace/ui";
import {
  SettingsGroupCard,
  SettingsGroupRow,
} from "@/features/settings/components/settings/SettingsGroupCard";
import { SettingsToggleRow } from "@/features/settings/components/settings/SettingsToggleRow";
import { useBrowserSettingsStore } from "@/features/settings/store/browser-settings-store";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";
import { useQueryState } from "nuqs";
import { settingsModalParams } from "@/shared/lib/nuqs/searchParams";

export function BrowserSettingsSection() {
  const t = useTranslations("settings.browser");
  const [placementOpen, setPlacementOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pagesOpen, setPagesOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [, setActiveSection] = useQueryState(
    "activeSettingTab",
    settingsModalParams.activeSettingTab,
  );

  const loadBrowser = useBrowserSettingsStore((s) => s.loadSettings);
  const defaultSurface = useBrowserSettingsStore((s) => s.defaultSurface);
  const setDefaultSurface = useBrowserSettingsStore((s) => s.setDefaultSurface);
  const newTabUrl = useBrowserSettingsStore((s) => s.newTabUrl);
  const setNewTabUrl = useBrowserSettingsStore((s) => s.setNewTabUrl);
  const [newTabDraft, setNewTabDraft] = useState(newTabUrl);
  const showAgentChrome = useBrowserSettingsStore((s) => s.showAgentChrome);
  const setShowAgentChrome = useBrowserSettingsStore((s) => s.setShowAgentChrome);

  const loadLayout = useLayoutSettingsStore((s) => s.loadSettings);
  const rsShowBrowser = useLayoutSettingsStore((s) => s.rsShowBrowser);
  const setRightSidebarShowBrowser = useLayoutSettingsStore(
    (s) => s.setRightSidebarShowBrowser,
  );

  useEffect(() => {
    void loadBrowser();
    void loadLayout();
  }, [loadBrowser, loadLayout]);

  useEffect(() => {
    setNewTabDraft(newTabUrl);
  }, [newTabUrl]);

  return (
    <div className="space-y-4">
      <SettingsGroupCard
        open={placementOpen}
        onOpenChange={setPlacementOpen}
        icon={LayoutTemplate}
        title={t("groups.placement.title")}
        description={t("groups.placement.description")}
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
      </SettingsGroupCard>

      <SettingsGroupCard
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        icon={Globe}
        title={t("groups.sidebar.title")}
        description={t("groups.sidebar.description")}
      >
        <SettingsToggleRow
          title={t("sidebar.title")}
          description={t("sidebar.description")}
          checked={rsShowBrowser}
          onCheckedChange={(value) => void setRightSidebarShowBrowser(value)}
        />
      </SettingsGroupCard>

      <SettingsGroupCard
        open={pagesOpen}
        onOpenChange={setPagesOpen}
        icon={Link2}
        title={t("groups.pages.title")}
        description={t("groups.pages.description")}
      >
        <SettingsGroupRow
          title={t("newTabUrl.title")}
          description={t("newTabUrl.description")}
          wide
        >
          <Input
            value={newTabDraft}
            placeholder="about:blank"
            onChange={(event) => setNewTabDraft(event.target.value)}
            onBlur={() => {
              if (newTabDraft !== newTabUrl) void setNewTabUrl(newTabDraft);
            }}
          />
        </SettingsGroupRow>
      </SettingsGroupCard>

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

      <SettingsGroupCard
        open={downloadsOpen}
        onOpenChange={setDownloadsOpen}
        icon={Download}
        title={t("groups.downloads.title")}
        description={t("groups.downloads.description")}
      >
        <SettingsGroupRow
          title={t("downloads.title")}
          description={t("downloads.description")}
          wide
        >
          <code className="text-xs text-muted-foreground">
            ~/.atmos/data/browser-use/downloads
          </code>
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t("links.desktopUse.title")}
          description={t("links.desktopUse.description")}
          wide
        >
          <button
            type="button"
            className="text-sm text-foreground underline-offset-4 hover:underline"
            onClick={() => void setActiveSection("desktop-use")}
          >
            {t("links.desktopUse.action")}
          </button>
        </SettingsGroupRow>
      </SettingsGroupCard>
    </div>
  );
}
