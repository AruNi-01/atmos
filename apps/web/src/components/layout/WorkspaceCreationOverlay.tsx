"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { TextShimmer } from "@workspace/ui";
import { useContextParams } from "@/hooks/use-context-params";
import { useWorkspaceCreationStore } from "@/hooks/use-workspace-creation-store";

export function WorkspaceCreationOverlay() {
  const { currentView, workspaceId } = useContextParams();
  const { isVisible, phase, pendingWorkspaceId, clear } = useWorkspaceCreationStore();

  React.useEffect(() => {
    if (!pendingWorkspaceId) {
      return;
    }
    if (currentView !== "workspace") {
      return;
    }
    if (workspaceId !== pendingWorkspaceId) {
      return;
    }

    clear();
  }, [clear, currentView, pendingWorkspaceId, workspaceId]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center bg-background/62 backdrop-blur-[2px]">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-border/70 bg-background/96 p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="size-5 animate-spin" />
          </div>
          <div className="min-w-0">
            <TextShimmer
              className="text-base font-semibold"
            >
              {phase === "opening" ? "Opening workspace" : "Creating workspace"}
            </TextShimmer>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {phase === "opening"
                ? "The worktree is ready. We are taking you into the workspace now."
                : "Preparing the worktree first. You will enter the workspace as soon as it is ready."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
