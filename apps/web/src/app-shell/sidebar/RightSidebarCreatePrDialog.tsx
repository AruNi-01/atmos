"use client";

import React from "react";
import dynamic from "next/dynamic";

const PRCreateModal = dynamic(
  () => import("@/features/github/components/PRCreateModal").then((m) => m.PRCreateModal),
  { ssr: false },
);

export interface RightSidebarCreatePrDialogProps {
  githubOwner: string | null;
  githubRepo: string | null;
  currentBranch: string | null;

  rsCreatePr: boolean;
  onCloseCreatePr: () => void;
  onPrCreated: () => void;
}

export const RightSidebarCreatePrDialog: React.FC<
  RightSidebarCreatePrDialogProps
> = ({
  githubOwner,
  githubRepo,
  currentBranch,
  rsCreatePr,
  onCloseCreatePr,
  onPrCreated,
}) => {
  return (
    <>
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
