"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { ActionRun } from "@/components/github/ActionsPanel";

const PRDetailModal = dynamic(
  () => import("@/components/github/PRDetailModal").then((m) => m.PRDetailModal),
  { ssr: false },
);
const PRCreateModal = dynamic(
  () => import("@/components/github/PRCreateModal").then((m) => m.PRCreateModal),
  { ssr: false },
);
const ActionsDetailModal = dynamic(
  () => import("@/components/github/ActionsDetailModal").then((m) => m.ActionsDetailModal),
  { ssr: false },
);

export interface RightSidebarDialogsProps {
  githubOwner: string | null;
  githubRepo: string | null;
  currentBranch: string | null;

  activePrNumber: number | null;
  onClosePr: () => void;
  onPrMerged: () => void;

  activeRunId: number | null;
  activeActionRun: ActionRun | null;
  onCloseActions: () => void;

  rsCreatePr: boolean;
  onCloseCreatePr: () => void;
  onPrCreated: () => void;
}

export const RightSidebarDialogs: React.FC<RightSidebarDialogsProps> = ({
  githubOwner,
  githubRepo,
  currentBranch,
  activePrNumber,
  onClosePr,
  onPrMerged,
  activeRunId,
  activeActionRun,
  onCloseActions,
  rsCreatePr,
  onCloseCreatePr,
  onPrCreated,
}) => {
  return (
    <>
      {githubOwner && githubRepo && currentBranch && (
        <PRDetailModal
          isOpen={activePrNumber !== null}
          onOpenChange={(open) => {
            if (!open) onClosePr();
          }}
          owner={githubOwner}
          repo={githubRepo}
          branch={currentBranch}
          prNumber={activePrNumber}
          onMerged={onPrMerged}
        />
      )}

      {githubOwner && githubRepo && currentBranch && (
        <ActionsDetailModal
          isOpen={activeRunId !== null}
          onOpenChange={(open) => {
            if (!open) onCloseActions();
          }}
          owner={githubOwner}
          repo={githubRepo}
          run={activeActionRun}
          runId={activeRunId}
        />
      )}

      {githubOwner && githubRepo && currentBranch && (
        <PRCreateModal
          isOpen={!!rsCreatePr}
          onOpenChange={(open) => {
            if (!open) onCloseCreatePr();
          }}
          owner={githubOwner}
          repo={githubRepo}
          branch={currentBranch}
          onCreated={onPrCreated}
        />
      )}
    </>
  );
};
