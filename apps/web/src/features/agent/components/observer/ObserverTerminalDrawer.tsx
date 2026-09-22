"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { create } from "zustand";
import {
  Drawer,
  DrawerCloseButton,
  DrawerCloseReserveProvider,
  DrawerContentBare,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  drawerCloseReserveClass,
} from "@workspace/ui";
import { useTaskDrawerInsets } from "@/features/task/components/task-github-drawer/use-task-drawer-insets";
import { makeCenterSpaceKey } from "@/app-shell/center-space/center-space";
import { resolveAgentStatusNavigationTarget } from "@/features/agent/lib/agent-status-navigation";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import {
  findWorkspacePaneIdsByTmuxWindowName,
  getScopeKey,
} from "@/features/terminal/store/terminal-store-helpers";

const Terminal = dynamic(
  () => import("@/features/terminal/components/Terminal").then((mod) => mod.Terminal),
  { ssr: false },
);

type ObserverTerminalState = {
  session: AgentStatusRecord | null;
  open: (session: AgentStatusRecord) => void;
  close: () => void;
};

export const useObserverTerminalStore = create<ObserverTerminalState>((set) => ({
  session: null,
  open: (session) => set({ session }),
  close: () => set({ session: null }),
}));

export function ObserverTerminalDrawer() {
  const t = useTranslations("AgentObserver");
  const insets = useTaskDrawerInsets();
  const session = useObserverTerminalStore((state) => state.session);
  const close = useObserverTerminalStore((state) => state.close);
  const workspacePanes = useTerminalStore((state) => state.workspacePanes);
  const open = Boolean(session);

  const located = useMemo(() => {
    if (!session) return null;
    const target = resolveAgentStatusNavigationTarget(session);
    if (!target.contextId || !target.tmuxWindowName) return null;
    const paintId = makeCenterSpaceKey(target.contextId, target.spaceId);
    const hit = findWorkspacePaneIdsByTmuxWindowName(
      useTerminalStore.getState(),
      paintId,
      target.tmuxWindowName,
    );
    if (!hit) return null;
    const pane = workspacePanes[getScopeKey(paintId, hit.terminalTabId)]?.[hit.paneId];
    if (!pane?.sessionId) return null;
    return {
      sessionId: pane.sessionId,
      workspaceId: pane.workspaceId || paintId,
      tmuxWindowName: pane.tmuxWindowName,
      terminalName: pane.label,
    };
  }, [session, workspacePanes]);

  const sheetWidth = `calc(100vw - ${insets.left}px - ${insets.right}px - 48px)`;
  const contentStyle = {
    top: insets.top,
    right: insets.right,
    bottom: insets.bottom,
    width: sheetWidth,
    maxWidth: "min(960px, 100%)",
    height: "auto",
    zIndex: 50,
    ["--initial-transform" as string]: `calc(100% + ${insets.right}px)`,
  } as React.CSSProperties;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      direction="right"
      handleOnly
      shouldScaleBackground
      dismissible
      modal
    >
      <DrawerPortal>
        <DrawerOverlay className="bg-black/40" style={{ zIndex: 50 }} />
        <DrawerContentBare
          className="fixed z-50 flex overflow-hidden rounded-xl border border-border/70 bg-background outline-none shadow-2xl"
          style={contentStyle}
        >
          <DrawerTitle className="sr-only">{t("openPane")}</DrawerTitle>
          <DrawerCloseReserveProvider>
            <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
              <DrawerCloseButton onClick={close} aria-label={t("close")} />
              <div className={`flex min-h-0 flex-1 flex-col ${drawerCloseReserveClass}`}>
                {located ? (
                  <Terminal
                    sessionId={located.sessionId}
                    workspaceId={located.workspaceId}
                    openContextId={located.workspaceId}
                    tmuxWindowName={located.tmuxWindowName}
                    terminalName={located.terminalName}
                    className="h-full min-h-0 w-full"
                    surfaceActive
                  />
                ) : (
                  <p className="px-5 pt-4 text-sm text-muted-foreground">{t("terminalMissing")}</p>
                )}
              </div>
            </div>
          </DrawerCloseReserveProvider>
        </DrawerContentBare>
      </DrawerPortal>
    </Drawer>
  );
}
