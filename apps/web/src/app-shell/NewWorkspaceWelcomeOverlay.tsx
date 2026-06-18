"use client";

import { HostedWelcomeGate } from "@/features/welcome/components/HostedWelcomeGate";
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";
import { DEFAULT_LEFT_SIDEBAR_SIZE } from "@/app-shell/sidebar-layout-constants";
import { cn } from "@/shared/lib/utils";
import { useWelcomeOverlayState } from "@/app-shell/use-welcome-overlay-state";

export function NewWorkspaceWelcomeOverlay() {
  const welcomeOverlay = useWelcomeOverlayState();
  const { isLeftCollapsed, leftSidebarSize } = useSidebarLayout();
  const overlayLeftSize = !isLeftCollapsed && leftSidebarSize > 0.5
    ? leftSidebarSize
    : DEFAULT_LEFT_SIDEBAR_SIZE;

  if (!welcomeOverlay.isVisible) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New workspace"
      className={cn(
        "fixed bottom-6 right-0 top-12 z-[49] overflow-hidden bg-background",
        welcomeOverlay.animationState === "visible" || welcomeOverlay.isClosing
          ? "transition-[left,transform] duration-350 ease-in-out"
          : "",
        welcomeOverlay.isClosing
          ? "translate-y-full"
          : welcomeOverlay.animationState === "visible"
            ? "translate-y-0"
            : "translate-y-full",
      )}
      style={{
        left: isLeftCollapsed ? 0 : `${overlayLeftSize}vw`,
      }}
    >
      <HostedWelcomeGate
        onAddProject={welcomeOverlay.openCreateProject}
        onConnectAgent={welcomeOverlay.connectAgent}
        onClose={welcomeOverlay.close}
      />
    </div>
  );
}
