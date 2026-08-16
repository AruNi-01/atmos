"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { PushPageStack, usePushPageTransition } from "@workspace/ui";

import CenterStage from "@/app-shell/CenterStage";
import Footer from "@/app-shell/Footer";
import Header from "@/app-shell/Header";
import LeftSidebar from "@/app-shell/LeftSidebar";
import { PanelLayout } from "@/app-shell/PanelLayout";
import { SettingsPage } from "@/features/settings/components/SettingsModal";
import { leaveSettingsPage, settingsHref } from "@/features/settings/lib/open-settings";
import {
  isSettingsPathname,
  rememberSettingsReturnPath,
} from "@/features/settings/lib/settings-return";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { settingsModalParams } from "@/shared/lib/nuqs/searchParams";

/**
 * Settings is a push-page over the previous shell page.
 *
 * While the URL is `/settings`, `useContextParams` reconstructs the underlay from
 * the stored return path so the real previous page (not welcome) stays mounted
 * and slides left as Settings slides in — and slides back on leave.
 */
export function AppShellMain() {
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
  const {
    phase: settingsPhase,
    isPresented: settingsPresented,
    open: openSettingsPush,
    close: closeSettingsPush,
  } = usePushPageTransition();

  const isSettingsRoute = isSettingsPathname(pathname);
  const wasSettingsRouteRef = useRef(isSettingsRoute);
  const settingsPhaseRef = useRef(settingsPhase);
  settingsPhaseRef.current = settingsPhase;

  useEffect(() => {
    if (isSettingsRoute) return;
    rememberSettingsReturnPath();
  }, [isSettingsRoute, pathname, searchParams]);

  useEffect(() => {
    if (!settingsModal) return;

    if (isSettingsRoute) {
      void setSettingsModal(false);
      return;
    }

    rememberSettingsReturnPath();
    router.push(settingsHref(activeSettingTab));
  }, [activeSettingTab, isSettingsRoute, router, setSettingsModal, settingsModal]);

  // Edge-trigger enter/exit so leave→closed does not immediately re-open.
  useLayoutEffect(() => {
    const wasSettings = wasSettingsRouteRef.current;
    wasSettingsRouteRef.current = isSettingsRoute;

    if (isSettingsRoute && !wasSettings) {
      openSettingsPush();
      return;
    }

    if (!isSettingsRoute && wasSettings && settingsPhaseRef.current === "open") {
      closeSettingsPush();
    }
  }, [closeSettingsPush, isSettingsRoute, openSettingsPush]);

  // Cold load already on /settings.
  useLayoutEffect(() => {
    if (isSettingsRoute) {
      openSettingsPush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cold start only
  }, []);

  const handleLeaveSettings = () => {
    closeSettingsPush({
      onComplete: () => leaveSettingsPage(router),
    });
  };

  return (
    <PushPageStack
      phase={settingsPhase}
      className="min-h-0 flex-1"
      baseClassName="min-h-0 flex-1"
      shiftBase
      base={
        // Left sidebar spans full viewport height; header + center + footer
        // live only in the main column to the right of the sidebar.
        <PanelLayout
          leftSidebar={<LeftSidebar />}
          centerStage={
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar">
              <Header />
              <div className="min-h-0 flex-1 overflow-hidden">
                <CenterStage />
              </div>
              <Footer />
            </div>
          }
        />
      }
      overlay={
        settingsPresented || isSettingsRoute ? (
          <SettingsPage onLeave={handleLeaveSettings} />
        ) : null
      }
      overlayKey="settings"
    />
  );
}
