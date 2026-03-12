"use client";

import React, { useState } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Trash2,
  toastManager,
} from "@workspace/ui";
import { skillsApi, type SkillInfo } from "@/api/ws-api";

interface SkillActionsMenuProps {
  skill: SkillInfo;
  onUpdated?: (skill: SkillInfo) => void | Promise<void>;
  onDeleted?: (skillId: string) => void | Promise<void>;
  className?: string;
}

function buildDeleteMessage(skill: SkillInfo) {
  const hasSymlink = skill.placements.some((placement) => placement.entry_kind === "symlink");
  if (hasSymlink) {
    return "Delete this skill entry? Only the symlink entries will be removed. The target files stay untouched.";
  }
  return "Delete this skill from all managed locations? This will remove the installed files.";
}

export function SkillActionsMenu({
  skill,
  onUpdated,
  onDeleted,
  className,
}: SkillActionsMenuProps) {
  const [pendingAction, setPendingAction] = useState<"enable" | "disable" | "delete" | null>(
    null,
  );

  if (!skill.manageable) {
    return null;
  }

  const refreshSkill = async () => {
    const next = await skillsApi.get(skill.scope, skill.id);
    await onUpdated?.(next);
  };

  const handleSetEnabled = async (enabled: boolean) => {
    const action = enabled ? "enable" : "disable";
    const confirmed = window.confirm(
      enabled
        ? "Enable this skill in all managed locations?"
        : "Disable this skill in all managed locations? The files will be moved out of the agent-visible skill directories.",
    );
    if (!confirmed) return;

    setPendingAction(action);
    try {
      await skillsApi.setEnabled(skill.id, enabled);
      await refreshSkill();
      toastManager.add({
        title: enabled ? "Skill enabled" : "Skill disabled",
        description: skill.title || skill.name,
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: enabled ? "Enable failed" : "Disable failed",
        description: error instanceof Error ? error.message : "Please try again.",
        type: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(buildDeleteMessage(skill))) return;

    setPendingAction("delete");
    try {
      await skillsApi.delete(skill.id);
      await onDeleted?.(skill.id);
      toastManager.add({
        title: "Skill deleted",
        description: skill.title || skill.name,
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        type: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const isBusy = pendingAction !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={(event) => event.stopPropagation()}
          className={cn("size-8 cursor-pointer rounded-lg", className)}
          disabled={isBusy}
          title="Manage skill"
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {skill.can_toggle && skill.status !== "enabled" && (
          <DropdownMenuItem onClick={() => void handleSetEnabled(true)} className="cursor-pointer">
            <Eye className="size-4" />
            Enable
          </DropdownMenuItem>
        )}
        {skill.can_toggle && skill.status !== "disabled" && (
          <DropdownMenuItem onClick={() => void handleSetEnabled(false)} className="cursor-pointer">
            <EyeOff className="size-4" />
            Disable
          </DropdownMenuItem>
        )}
        {skill.can_delete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void handleDelete()}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
