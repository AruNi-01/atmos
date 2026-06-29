"use client";

import { useTranslations } from "next-intl";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@workspace/ui";
import {
  Folder,
  FolderGit2,
  FolderPlus,
  Terminal,
} from "lucide-react";

import type { AutomationTargetKind } from "@/features/automations/types";
import type { Project, Workspace } from "@/shared/types/domain";

export function AutomationEnvironmentPicker({
  targetKind,
  projectGuid,
  workspaceGuid,
  projects,
  workspaces,
  projectsLoading,
  onTargetKindChange,
  onProjectGuidChange,
  onWorkspaceGuidChange,
  surface = "card",
}: {
  targetKind: AutomationTargetKind;
  projectGuid: string;
  workspaceGuid: string;
  projects: Project[];
  workspaces: Array<{ project: Project; workspace: Workspace }>;
  projectsLoading: boolean;
  onTargetKindChange: (kind: AutomationTargetKind) => void;
  onProjectGuidChange: (guid: string) => void;
  onWorkspaceGuidChange: (guid: string) => void;
  surface?: "card" | "plain";
}) {
  const t = useTranslations("automation.environmentPicker");
  const targetOptions: Array<{
    value: AutomationTargetKind;
    label: string;
    description: string;
    icon: typeof Folder;
  }> = [
    {
      value: "project",
      label: t("options.project.label"),
      description: t("options.project.description"),
      icon: FolderGit2,
    },
    {
      value: "workspace",
      label: t("options.workspace.label"),
      description: t("options.workspace.description"),
      icon: Folder,
    },
    {
      value: "new_workspace",
      label: t("options.newWorkspace.label"),
      description: t("options.newWorkspace.description"),
      icon: FolderPlus,
    },
    {
      value: "standalone",
      label: t("options.standalone.label"),
      description: t("options.standalone.description"),
      icon: Terminal,
    },
  ];

  return (
    <section
      className={cn(
        surface === "card"
          ? "rounded-md border border-border bg-background p-4 shadow-xs"
          : "space-y-4",
      )}
      >
      <div className="flex items-center gap-2">
        <FolderGit2 className="size-4 text-muted-foreground" />
        <div className="text-sm font-semibold text-foreground">{t("title")}</div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {targetOptions.map((option) => {
          const Icon = option.icon;
          const selected = targetKind === option.value;
          const disabled =
            (option.value === "project" || option.value === "new_workspace") &&
            projects.length === 0 &&
            !projectsLoading
              ? true
              : option.value === "workspace" && workspaces.length === 0 && !projectsLoading;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onTargetKindChange(option.value)}
              className={cn(
                "flex min-h-[82px] items-start gap-3 rounded-md border p-3 text-left transition-colors",
                selected
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-background hover:bg-muted/35",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="mt-1 block text-xs leading-4 text-muted-foreground">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {targetKind === "project" || targetKind === "new_workspace" ? (
          <div className="space-y-2">
            <Label>{t("fields.project")}</Label>
            <Select
              value={projectGuid}
              onValueChange={onProjectGuidChange}
              disabled={projectsLoading || projects.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    projectsLoading
                      ? t("placeholders.loadingProjects")
                      : t("placeholders.selectProject")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : targetKind === "workspace" ? (
          <div className="space-y-2">
            <Label>{t("fields.workspace")}</Label>
            <Select
              value={workspaceGuid}
              onValueChange={onWorkspaceGuidChange}
              disabled={projectsLoading || workspaces.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    projectsLoading
                      ? t("placeholders.loadingWorkspaces")
                      : t("placeholders.selectWorkspace")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map(({ project, workspace }) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.displayName || workspace.name} / {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2 text-sm text-muted-foreground">
            {t("standaloneHint")}
          </div>
        )}
      </div>
    </section>
  );
}
