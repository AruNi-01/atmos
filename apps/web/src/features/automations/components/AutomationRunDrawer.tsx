"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Button,
  Drawer,
  DrawerContentBare,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "@workspace/ui";
import { X } from "lucide-react";

import { RunDetailPanel } from "@/features/automations/components/RunDetailPanel";
import { useTaskDrawerInsets } from "@/features/task/components/task-github-drawer/use-task-drawer-insets";
import type {
  AutomationAgentCapability,
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationRunSummary,
} from "@/features/automations/types";

const AgentChatPanel = dynamic(
  () =>
    import("@/features/agent/components/AgentChatPanel").then(
      (module) => module.AgentChatPanel,
    ),
  { ssr: false },
);

export function AutomationRunDrawer({
  run,
  open,
  agents,
  artifact,
  artifactLoading,
  busyAction,
  standaloneChatOpen,
  onClose,
  onCloseStandaloneChat,
  onCancelRun,
  onFetchArtifact,
  onContinueInTerminal,
}: {
  run: AutomationRunSummary | null;
  open: boolean;
  agents: AutomationAgentCapability[];
  artifact: AutomationArtifactResponse | null;
  artifactLoading: boolean;
  busyAction: string | null;
  standaloneChatOpen: boolean;
  onClose: () => void;
  onCloseStandaloneChat: () => void;
  onCancelRun: (run: AutomationRunSummary) => Promise<void>;
  onFetchArtifact: (
    run: AutomationRunSummary,
    kind: AutomationArtifactKind,
  ) => Promise<void>;
  onContinueInTerminal: (run: AutomationRunSummary) => Promise<void>;
}) {
  const t = useTranslations("automation.runDrawer");
  const insets = useTaskDrawerInsets();

  const sheetWidth = `calc(100vw - ${insets.left}px - ${insets.right}px - 48px)`;
  const contentStyle = {
    top: insets.top,
    right: insets.right,
    bottom: insets.bottom,
    width: sheetWidth,
    maxWidth: standaloneChatOpen ? "min(1100px, 100%)" : "min(720px, 100%)",
    height: "auto",
    zIndex: 50,
    ["--initial-transform" as string]: `calc(100% + ${insets.right}px)`,
  } as React.CSSProperties;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
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
          <DrawerTitle className="sr-only">
            {run ? t("titleNamed", { id: run.guid.slice(0, 8) }) : t("title")}
          </DrawerTitle>

          <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 z-30 size-7 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label={t("close")}
            >
              <X className="size-3.5" />
            </Button>

            <div
              className={
                standaloneChatOpen
                  ? "grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]"
                  : "flex min-h-0 flex-1 flex-col overflow-hidden"
              }
            >
              <div className="min-h-0 flex-1 overflow-hidden">
                <RunDetailPanel
                  run={run}
                  agents={agents}
                  artifact={artifact}
                  artifactLoading={artifactLoading}
                  busyAction={busyAction}
                  onCancelRun={onCancelRun}
                  onFetchArtifact={onFetchArtifact}
                  onContinueInTerminal={onContinueInTerminal}
                  headerClassName="pr-12"
                />
              </div>
              {standaloneChatOpen ? (
                <section className="flex min-h-0 flex-col overflow-hidden border-t border-border lg:border-l lg:border-t-0">
                  <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                    <div className="min-w-0 pr-8">
                      <div className="text-sm font-semibold text-foreground">
                        {t("standalone.title")}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t("standalone.description")}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={onCloseStandaloneChat}
                      aria-label={t("standalone.close")}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <AgentChatPanel
                      variant="sidebar"
                      publishStatus={false}
                      active={standaloneChatOpen}
                    />
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </DrawerContentBare>
      </DrawerPortal>
    </Drawer>
  );
}
