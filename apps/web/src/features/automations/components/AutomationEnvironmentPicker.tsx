"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@workspace/ui";
import {
  Check,
  ChevronDown,
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
                "flex min-h-[82px] items-start gap-3 rounded-md border p-3 text-left",
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
            <Label className="flex items-center gap-2">
              <FolderGit2 className="size-4 text-muted-foreground" />
              {t("fields.project")}
            </Label>
            <Select
              value={projectGuid}
              onValueChange={onProjectGuidChange}
              disabled={projectsLoading || projects.length === 0}
            >
              <SelectTrigger className="w-full bg-background/35">
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
                  <SelectItem key={project.id} value={project.id} textValue={project.name}>
                    <span className="flex items-center gap-2">
                      <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
                      {project.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : targetKind === "workspace" ? (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Folder className="size-4 text-muted-foreground" />
              {t("fields.workspace")}
            </Label>
            <WorkspaceSelect
              workspaces={workspaces}
              workspaceGuid={workspaceGuid}
              disabled={projectsLoading || workspaces.length === 0}
              loading={projectsLoading}
              onWorkspaceGuidChange={onWorkspaceGuidChange}
            />
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

function WorkspaceSelect({
  workspaces,
  workspaceGuid,
  disabled,
  loading,
  onWorkspaceGuidChange,
}: {
  workspaces: Array<{ project: Project; workspace: Workspace }>;
  workspaceGuid: string;
  disabled: boolean;
  loading: boolean;
  onWorkspaceGuidChange: (guid: string) => void;
}) {
  const t = useTranslations("automation.environmentPicker");
  const [open, setOpen] = React.useState(false);
  const selected = workspaces.find((item) => item.workspace.id === workspaceGuid);
  const selectedLabel = selected
    ? `${selected.workspace.displayName || selected.workspace.name} / ${selected.project.name}`
    : null;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!disabled) setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "border-input flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background/35 px-3 py-2 text-sm shadow-xs outline-none transition-shadow",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "dark:bg-input/30 dark:hover:bg-input/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !selectedLabel && "text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Folder className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selectedLabel
                ?? (loading
                  ? t("placeholders.loadingWorkspaces")
                  : t("placeholders.selectWorkspace"))}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder={t("placeholders.searchWorkspaces")} />
          <CommandList className="max-h-64">
            <CommandEmpty>{t("placeholders.noMatchingWorkspaces")}</CommandEmpty>
            <CommandGroup>
              {workspaces.map(({ project, workspace }) => {
                const label = `${workspace.displayName || workspace.name} / ${project.name}`;
                const isSelected = workspace.id === workspaceGuid;
                return (
                  <CommandItem
                    key={workspace.id}
                    value={label}
                    onSelect={() => {
                      onWorkspaceGuidChange(workspace.id);
                      setOpen(false);
                    }}
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
