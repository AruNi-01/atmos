"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { TextShimmer } from "@workspace/ui";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useWorkspaceCreationStore } from "@/features/workspace/store/workspace-creation-store";

export function WorkspaceCreationOverlay() {
  const t = useTranslations("appShell.workspaceCreationOverlay");
  const { currentView, workspaceId } = useContextParams();
  const isVisible = useWorkspaceCreationStore((s) => s.isVisible);
  const phase = useWorkspaceCreationStore((s) => s.phase);
  const pendingWorkspaceId = useWorkspaceCreationStore((s) => s.pendingWorkspaceId);
  const clear = useWorkspaceCreationStore((s) => s.clear);

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
              {phase === "opening" ? t("openingTitle") : t("creatingTitle")}
            </TextShimmer>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {phase === "opening"
                ? t("openingDescription")
                : t("creatingDescription")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
