"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@workspace/ui";
import { Folders } from "lucide-react";

export type FollowProjectInGroupPending = {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  groupId: string;
  groupName: string;
};

function GroupNameBadge({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "inline-flex max-w-full items-center gap-1 border border-border/70 bg-muted/80 px-1.5 py-0.5 text-[11px] font-medium text-foreground",
        className,
      )}
    >
      <Folders className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </Badge>
  );
}

/**
 * Shown when assigning a workspace to a group that already contains its parent project.
 * Prefer unlinking the workspace so it only appears under the project in that group.
 */
export function FollowProjectInGroupDialog({
  pending,
  busy = false,
  onFollowProject,
  onAssignWorkspace,
  onClose,
}: {
  pending: FollowProjectInGroupPending | null;
  busy?: boolean;
  onFollowProject: () => void;
  onAssignWorkspace: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("appShell.groups");
  const open = pending !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t("followProject.title")}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {pending ? (
                <>
                  <p>
                    {t("followProject.description", {
                      workspaceName: pending.workspaceName,
                      projectName: pending.projectName,
                    })}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-foreground">
                    <span className="text-muted-foreground">
                      {t("followProject.targetGroup")}
                    </span>
                    <GroupNameBadge name={pending.groupName} />
                  </div>
                </>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={onFollowProject}
          >
            {t("followProject.followProject")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={onAssignWorkspace}
          >
            {t("followProject.assignWorkspace")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={onClose}
          >
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
