"use client";

import { useEffect } from "react";
import { useQueryState } from "nuqs";

import CenterStage from "@/app-shell/CenterStage";
import Footer from "@/app-shell/Footer";
import Header from "@/app-shell/Header";
import LeftSidebar from "@/app-shell/LeftSidebar";
import { PanelLayout } from "@/app-shell/PanelLayout";
import RightSidebar from "@/app-shell/RightSidebar";
import { SettingsPage } from "@/features/settings/components/SettingsModal";
import { settingsHref } from "@/features/settings/lib/open-settings";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { settingsModalParams } from "@/shared/lib/nuqs/searchParams";

export function AppShellMain() {
  const { currentView } = useContextParams();
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
    if (!settingsModal) return;

    if (currentView === "settings") {
      void setSettingsModal(false);
      return;
    }

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
