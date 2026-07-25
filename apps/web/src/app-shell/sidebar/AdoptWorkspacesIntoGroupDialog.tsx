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
import type { GroupedProjectWorkspace } from "@/app-shell/sidebar/user-groups";

export type AdoptWorkspacesIntoGroupPending = {
  projectId: string;
  projectName: string;
  groupId: string;
  groupName: string;
  workspaces: GroupedProjectWorkspace[];
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

export function AdoptWorkspacesIntoGroupDialog({
  pending,
  busy = false,
  onProjectOnly,
  onAdopt,
  onClose,
}: {
  pending: AdoptWorkspacesIntoGroupPending | null;
  busy?: boolean;
  onProjectOnly: () => void;
  onAdopt: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("appShell.groups");
  const open = pending !== null;
  const count = pending?.workspaces.length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t("adoptWorkspaces.title")}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {pending ? (
                <>
                  <p>
                    {t("adoptWorkspaces.description", {
                      count,
                      projectName: pending.projectName,
                    })}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-foreground">
                    <span className="text-muted-foreground">
                      {t("adoptWorkspaces.targetGroup")}
                    </span>
                    <GroupNameBadge name={pending.groupName} />
                  </div>
                </>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>

        {pending && pending.workspaces.length > 0 ? (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            {pending.workspaces.map((workspace) => (
              <li
                key={workspace.workspaceId}
                className="flex min-w-0 items-center justify-between gap-2"
              >
                <span className="truncate text-foreground">
                  {workspace.workspaceName}
                </span>
                <GroupNameBadge
                  name={workspace.groupName}
                  className="max-w-[45%] shrink-0"
                />
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={onAdopt}
          >
            {t("adoptWorkspaces.adopt", { count })}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={onProjectOnly}
          >
            {t("adoptWorkspaces.projectOnly")}
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
