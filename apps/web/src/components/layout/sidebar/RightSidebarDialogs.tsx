"use client";

import React from "react";
import { Loader2 } from "@workspace/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
} from "@workspace/ui";
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

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  isDestructive?: boolean;
}

export interface RightSidebarDialogsProps {
  confirmDialog: ConfirmDialogState;
  onConfirm: () => Promise<void>;
  onCloseConfirm: () => void;
  isGlobalActionLoading: boolean;

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
  confirmDialog,
  onConfirm,
  onCloseConfirm,
  isGlobalActionLoading,
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
      <Dialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) onCloseConfirm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant={confirmDialog.isDestructive ? "destructive" : "default"}
              size="sm"
              onClick={onConfirm}
              disabled={isGlobalActionLoading}
            >
              {isGlobalActionLoading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              {confirmDialog.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
