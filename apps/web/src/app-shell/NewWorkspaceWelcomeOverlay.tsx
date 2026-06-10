"use client";

import { HostedWelcomeGate } from "@/features/welcome/components/HostedWelcomeGate";
import { cn } from "@/shared/lib/utils";
import { useWelcomeOverlayState } from "@/app-shell/use-welcome-overlay-state";

export function NewWorkspaceWelcomeOverlay() {
  const welcomeOverlay = useWelcomeOverlayState();

  if (!welcomeOverlay.isVisible) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New workspace"
      className={cn(
        "fixed inset-0 z-[49] overflow-hidden bg-background",
        welcomeOverlay.animationState === "visible" || welcomeOverlay.isClosing
          ? "transition-transform duration-350 ease-in-out"
          : "",
        welcomeOverlay.isClosing
          ? "translate-y-full"
          : welcomeOverlay.animationState === "visible"
            ? "translate-y-0"
            : "translate-y-full",
      )}
    >
      <HostedWelcomeGate
        onAddProject={welcomeOverlay.openCreateProject}
        onConnectAgent={welcomeOverlay.connectAgent}
        onClose={welcomeOverlay.close}
      />
    </div>
  );
}
