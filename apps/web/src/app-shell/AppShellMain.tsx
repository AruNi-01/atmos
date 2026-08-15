"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryState } from "nuqs";

import CenterStage from "@/app-shell/CenterStage";
import Footer from "@/app-shell/Footer";
import Header from "@/app-shell/Header";
import LeftSidebar from "@/app-shell/LeftSidebar";
import { PanelLayout } from "@/app-shell/PanelLayout";
import RightSidebar from "@/app-shell/RightSidebar";
import { SettingsPage } from "@/features/settings/components/SettingsModal";
import { settingsHref } from "@/features/settings/lib/open-settings";
import { rememberSettingsReturnPath } from "@/features/settings/lib/settings-return";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { settingsModalParams } from "@/shared/lib/nuqs/searchParams";

export function AppShellMain() {
  const { currentView } = useContextParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useAppRouter();
  const [settingsModal, setSettingsModal] = useQueryState(
    "settingsModal",
    settingsModalParams.settingsModal,
  );
  const [activeSettingTab] = useQueryState(
    "activeSettingTab",
    settingsModalParams.activeSettingTab,
  );

  useEffect(() => {
    if (currentView === "settings") return;
    rememberSettingsReturnPath();
  }, [currentView, pathname, searchParams]);

  useEffect(() => {
    if (!settingsModal) return;

    if (currentView === "settings") {
      void setSettingsModal(false);
      return;
    }

    rememberSettingsReturnPath();
    router.push(settingsHref(activeSettingTab));
  }, [activeSettingTab, currentView, router, setSettingsModal, settingsModal]);

  if (currentView === "settings") {
    return <SettingsPage />;
  }

  return (
    <>
      <Header />

      <PanelLayout
        leftSidebar={<LeftSidebar />}
        centerStage={<CenterStage />}
        rightSidebar={<RightSidebar />}
      />

      <Footer />
    </>
  );
}
