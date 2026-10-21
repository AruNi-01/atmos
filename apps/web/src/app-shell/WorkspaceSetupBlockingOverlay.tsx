"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, TextShimmer } from "@workspace/ui";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  getWorkspaceCreateOriginKey,
  useWorkspaceCreationStore,
} from "@/features/workspace/store/workspace-creation-store";
import { isWorkspaceCreateReadyToEnter } from "@/features/workspace/lib/workspace-setup";

export function WorkspaceSetupBlockingOverlay() {
  const t = useTranslations("appShell.workspaceCreationOverlay");
  const { currentView, workspaceId: currentWorkspaceId, projectId } = useContextParams();
  const currentOriginKey = getWorkspaceCreateOriginKey({
    currentView,
    workspaceId: currentWorkspaceId,
    projectId,
  });
  const jobs = useWorkspaceCreationStore((state) => state.jobs);
  const latestJobId = useWorkspaceCreationStore((state) => state.latestJobId);
  const blockingJob = useMemo(() => {
    const latest = jobs.find((job) => job.id === latestJobId);
    if (latest?.blocking) return latest;
    return [...jobs].reverse().find((job) => job.blocking) ?? null;
  }, [jobs, latestJobId]);
  const progress = useProjectStore((state) =>
    blockingJob?.workspaceId ? (state.setupProgress[blockingJob.workspaceId] ?? null) : null,
  );
  const failed = progress?.status === "error";
  const show =
    !!blockingJob &&
    blockingJob.originKey === currentOriginKey &&
    blockingJob.workspaceId !== currentWorkspaceId &&
    !failed;
  const opening = !!blockingJob?.workspaceId && !failed && isWorkspaceCreateReadyToEnter(progress);

  return (
    <Dialog open={show} onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        data-workspace-setup-blocking-overlay=""
        overlayClassName="z-[200] bg-background/62 backdrop-blur-[2px]"
        className="z-[200] gap-0 p-6 sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="size-5 animate-spin" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base">
              <TextShimmer as="span" className="text-base font-semibold">
                {opening ? t("openingTitle") : t("creatingTitle")}
              </TextShimmer>
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-6">
              {opening ? t("openingDescription") : t("creatingDescription")}
            </DialogDescription>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
