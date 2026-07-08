"use client";

import { HostedWelcomeGate } from "@/features/welcome/components/HostedWelcomeGate";
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";
import { DEFAULT_LEFT_SIDEBAR_SIZE } from "@/app-shell/sidebar-layout-constants";
import { cn } from "@/shared/lib/utils";
import { useWelcomeOverlayState } from "@/app-shell/use-welcome-overlay-state";

export function NewWorkspaceWelcomeOverlay() {
  const welcomeOverlay = useWelcomeOverlayState();
  const { isLeftCollapsed, liveLeftSidebarSize, isLeftSidebarDragging } = useSidebarLayout();
  const overlayLeftSize = !isLeftCollapsed && liveLeftSidebarSize > 0.5
    ? liveLeftSidebarSize
    : DEFAULT_LEFT_SIDEBAR_SIZE;

  if (!welcomeOverlay.isVisible) {
    return null;
  }

  const isShown = welcomeOverlay.animationState === "visible" && !welcomeOverlay.isClosing;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New workspace"
      className={cn(
        "absolute inset-y-0 right-0 z-[49] transform-gpu overflow-hidden bg-background will-change-transform",
        "rounded-tl-xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)]",
        isLeftSidebarDragging
          ? "transition-transform"
          : "transition-[left,transform]",
        "duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        isShown
          ? "translate-y-0"
          : "translate-y-full",
      )}
      style={{
        left: isLeftCollapsed ? 0 : `calc(${overlayLeftSize}% + 1px)`,
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
