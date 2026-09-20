"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Drawer,
  DrawerCloseButton,
  DrawerCloseReserveProvider,
  DrawerContentBare,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "@workspace/ui";
import { useTaskDrawerInsets } from "@/features/task/components/task-github-drawer/use-task-drawer-insets";
import { HostSessionDetailView } from "@/features/agent-sessions/components/HostSessionDetailView";

const CENTER_DRAWER_WIDTH_RATIO = 0.7;
const SHEET_GAP_Y_PX = 12;
const SHEET_GAP_RIGHT_PX = 12;

export function HostSessionDrawer({
  selectedKey,
  onClose,
}: {
  selectedKey: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("agentSessions");
  const insets = useTaskDrawerInsets();
  const [contentKey, setContentKey] = React.useState<string | null>(selectedKey);
  const open = Boolean(selectedKey);

  React.useEffect(() => {
    if (selectedKey) setContentKey(selectedKey);
  }, [selectedKey]);

  const sheetRight = insets.right + SHEET_GAP_RIGHT_PX;
  const sheetWidth = `calc((100vw - ${insets.left}px - ${insets.right}px) * ${CENTER_DRAWER_WIDTH_RATIO})`;
  const contentStyle = {
    top: insets.top + SHEET_GAP_Y_PX,
    right: sheetRight,
    bottom: insets.bottom + SHEET_GAP_Y_PX,
    width: sheetWidth,
    maxWidth: "none",
    height: "auto",
    zIndex: 50,
    ["--initial-transform" as string]: `calc(100% + ${sheetRight}px)`,
  } as React.CSSProperties;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onAnimationEnd={(isOpen) => {
        if (!isOpen) setContentKey(null);
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
          className="fixed z-50 flex overflow-hidden rounded-xl border border-border/70 bg-background outline-none shadow-2xl !select-text"
          style={contentStyle}
        >
          <DrawerTitle className="sr-only">{t("title")}</DrawerTitle>
          <DrawerCloseReserveProvider>
            <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden select-text">
              <DrawerCloseButton onClick={onClose} aria-label={t("close")} />
              {contentKey ? <HostSessionDetailView selectedKey={contentKey} /> : null}
            </div>
          </DrawerCloseReserveProvider>
        </DrawerContentBare>
      </DrawerPortal>
    </Drawer>
  );
}
