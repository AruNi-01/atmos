"use client";

import React from "react";
import dynamic from "next/dynamic";

const PRCreateModal = dynamic(
  () => import("@/features/github/components/PRCreateModal").then((m) => m.PRCreateModal),
  { ssr: false },
);

export interface CreatePrDialogProps {
  githubOwner: string | null;
  githubRepo: string | null;
  currentBranch: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

/** Hosts the create-PR modal for the GitHub center hub. */
export function CreatePrDialog({
  githubOwner,
  githubRepo,
  currentBranch,
  open,
  onOpenChange,
  onCreated,
}: CreatePrDialogProps) {
  if (!githubOwner || !githubRepo || !currentBranch) return null;

  return (
    <PRCreateModal
      isOpen={open}
      onOpenChange={onOpenChange}
      owner={githubOwner}
      repo={githubRepo}
      branch={currentBranch}
      onCreated={onCreated}
    />
  );
}
