"use client";

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

const TARGET_OPTIONS: Array<{
  value: AutomationTargetKind;
  label: string;
  description: string;
  icon: typeof Folder;
}> = [
  { value: "project", label: "Project", description: "Use a project root", icon: FolderGit2 },
  { value: "workspace", label: "Workspace", description: "Use an existing worktree", icon: Folder },
  { value: "new_workspace", label: "New Workspace", description: "Create one per run", icon: FolderPlus },
  { value: "standalone", label: "Standalone", description: "Use a run folder", icon: Terminal },
];

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
}) {
  return (
    <section className="rounded-md border border-border bg-background p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <FolderGit2 className="size-4 text-muted-foreground" />
        <div className="text-sm font-semibold text-foreground">Environment</div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {TARGET_OPTIONS.map((option) => {
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
            <Label>Project</Label>
            <Select
              value={projectGuid}
              onValueChange={onProjectGuidChange}
              disabled={projectsLoading || projects.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={projectsLoading ? "Loading projects" : "Select project"} />
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
            <Label>Workspace</Label>
            <Select
              value={workspaceGuid}
              onValueChange={onWorkspaceGuidChange}
              disabled={projectsLoading || workspaces.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={projectsLoading ? "Loading workspaces" : "Select workspace"} />
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
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            Runs use a standalone directory under the owning Computer&apos;s automation run folder.
          </div>
        )}
      </div>
    </section>
  );
}
