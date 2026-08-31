"use client";

import { HostedWelcomeGate } from "@/features/welcome/components/HostedWelcomeGate";
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";
import {
  APP_FOOTER_HEIGHT_PX,
  CENTER_STAGE_GUTTER_X_PX,
  CENTER_STAGE_GUTTER_Y_PX,
  CENTER_STAGE_RADIUS_CLASS,
  DEFAULT_LEFT_SIDEBAR_SIZE,
} from "@/app-shell/sidebar-layout-constants";
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

  // Align with the center-stage floating card. This overlay is already inside
  // PanelLayout (below Header), so only reserve the footer strip + gutters.
  const gutterX = CENTER_STAGE_GUTTER_X_PX;
  const gutterY = CENTER_STAGE_GUTTER_Y_PX;
  const footerHeightPx = APP_FOOTER_HEIGHT_PX;
  const leftInset = isLeftCollapsed
    ? gutterX
    : `calc(${overlayLeftSize}% + 1px + ${gutterX}px)`;
  // Tailwind v4 maps translate-* utilities to the individual `translate` property
  // (not `transform`). Transition that property so slide open/close actually animates.
  // While the left sidebar is dragged, drop `left` from the transition so the overlay
  // tracks the divider instantly.
  const transitionProperty = isLeftSidebarDragging ? "translate" : "left, translate";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New workspace"
      className={cn(
        "absolute z-[49] bg-background will-change-[translate]",
        CENTER_STAGE_RADIUS_CLASS,
        "ring-1 ring-border/40 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]",
        // Prefer reduced motion: kill the slide without fighting inline transition props.
        "motion-reduce:![transition-property:none]",
        isShown
          ? "translate-y-0"
          : "translate-y-full",
      )}
      style={{
        top: gutterY,
        right: gutterX,
        bottom: footerHeightPx + gutterY,
        left: leftInset,
        transitionProperty,
        transitionDuration: "400ms",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className={cn("h-full min-h-0 overflow-hidden", CENTER_STAGE_RADIUS_CLASS)}>
        <HostedWelcomeGate
          onAddProject={welcomeOverlay.openCreateProject}
          onConnectAgent={welcomeOverlay.connectAgent}
          onClose={welcomeOverlay.close}
        />
      </div>
    </div>
  );
}
