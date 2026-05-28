"use client";

import React from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import {
  ArrowBigUp,
  Bot,
  Check,
  ChevronDown,
  Clapperboard,
  Command,
  LoaderCircle,
  Plus,
} from "lucide-react";
import type {
  Project,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  WorkspaceLabelDots,
  WorkspaceLabelPicker,
  WorkspacePrioritySelect,
  WorkspaceStatusSelect,
} from "@/app-shell/sidebar/workspace-metadata-controls";
import type { AgentMenuOption } from "@/features/welcome/lib/welcome-page-helpers";

export function WelcomeAgentSelector({
  availableAgents,
  onConnectAgent,
  onSelectAgent,
  selectedAgent,
  selectedAgentId,
}: {
  availableAgents: AgentMenuOption[];
  onConnectAgent?: () => void;
  onSelectAgent: (agentId: string) => void;
  selectedAgent: AgentMenuOption | undefined;
  selectedAgentId: string;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="absolute -left-3 -top-3 z-20 inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border border-border/60 bg-background text-foreground/90 shadow-[0_6px_20px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Select agent"
        >
          {selectedAgent?.iconType === "built-in" ? (
            <AgentIcon registryId={selectedAgent.id} name={selectedAgent.label} size={18} />
          ) : (
            <Bot className="size-4 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {availableAgents.length > 0 ? (
          availableAgents.map((agent) => {
            const disabledReason = agent.disabledReason?.trim();
            return (
            <DropdownMenuItem
              key={agent.id}
              disabled={!!disabledReason}
              onClick={() => {
                if (!disabledReason) {
                  onSelectAgent(agent.id);
                }
              }}
              className="cursor-pointer justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                {agent.iconType === "built-in" ? (
                  <AgentIcon registryId={agent.id} name={agent.label} size={16} />
                ) : (
                  <Bot className="size-4 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block truncate">{agent.label}</span>
                  {agent.description || disabledReason ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {agent.description ?? disabledReason}
                    </span>
                  ) : null}
                </span>
              </span>
              {agent.id === selectedAgentId ? <Check className="size-4 text-foreground" /> : null}
            </DropdownMenuItem>
            );
          })
        ) : (
          <DropdownMenuItem onClick={onConnectAgent} className="cursor-pointer">
            Connect agents
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WelcomeComposerControls({
  createWorkspaceLabel,
  disabledSubmit,
  isInitialProjectsLoading,
  isSubmitting,
  onAddProject,
  onProjectChange,
  priority,
  projectId,
  projects,
  selectedLabels,
  selectedProject,
  setPriority,
  setSelectedLabels,
  setWorkflowStatus,
  workflowStatus,
  workspaceLabels,
}: {
  createWorkspaceLabel: React.ComponentProps<typeof WorkspaceLabelPicker>["onCreateLabel"];
  disabledSubmit: boolean;
  isInitialProjectsLoading: boolean;
  isSubmitting: boolean;
  onAddProject?: () => void;
  onProjectChange: (projectId: string) => void;
  priority: WorkspacePriority;
  projectId: string;
  projects: Project[];
  selectedLabels: WorkspaceLabel[];
  selectedProject: Project | null | undefined;
  setPriority: (value: WorkspacePriority) => void;
  setSelectedLabels: (labels: WorkspaceLabel[]) => void;
  setWorkflowStatus: (value: WorkspaceWorkflowStatus) => void;
  workflowStatus: WorkspaceWorkflowStatus;
  workspaceLabels: WorkspaceLabel[];
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-9 min-w-[160px] items-center gap-2 rounded-md border px-3 text-sm backdrop-blur-sm transition-colors hover:bg-muted",
                projects.length === 0
                  ? "border-dashed border-border bg-muted/25 text-muted-foreground"
                  : "border-border/60 bg-background/40 text-foreground/90",
              )}
            >
              {isInitialProjectsLoading ? (
                <span className="truncate font-medium text-muted-foreground">Loading projects…</span>
              ) : projects.length === 0 ? (
                <>
                  <Plus className="size-3.5 shrink-0" />
                  <span className="truncate font-medium">Add a project first</span>
                </>
              ) : (
                <span className="truncate font-medium">
                  {selectedProject?.name ?? "Select project"}
                </span>
              )}
              <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuItem onClick={onAddProject} className="cursor-pointer font-medium">
              Add Project
            </DropdownMenuItem>
            {projects.length > 0 ? (
              <>
                <div className="my-1 h-px bg-border/70" />
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => onProjectChange(project.id)}
                    className="cursor-pointer justify-between gap-3"
                  >
                    <span className="truncate">{project.name}</span>
                    {project.id === projectId ? <Check className="size-4 text-foreground" /> : null}
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <WorkspacePrioritySelect
          value={priority}
          onChange={setPriority}
          contentSide="top"
          surface
          triggerClassName="h-9 rounded-md border border-border/60 bg-background/25 px-3 text-muted-foreground"
          labelClassName="font-medium text-foreground/88"
        />
        <WorkspaceStatusSelect
          value={workflowStatus}
          onChange={setWorkflowStatus}
          contentSide="top"
          surface
          triggerClassName="h-9 rounded-md border border-border/60 bg-background/25 px-3 text-muted-foreground"
          labelClassName="font-medium text-foreground/88"
        />
        <div className="flex items-center gap-2">
          <WorkspaceLabelPicker
            labels={selectedLabels}
            availableLabels={workspaceLabels}
            onChange={setSelectedLabels}
            onCreateLabel={createWorkspaceLabel}
            contentSide="top"
            editorSide="top"
            surface
            triggerClassName="h-9 rounded-md border border-border/60 bg-background/25 px-3 text-muted-foreground"
          />
          <WorkspaceLabelDots labels={selectedLabels} overlap className="pl-1" />
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 rounded-md self-end md:self-auto"
            disabled={disabledSubmit}
            aria-label={isSubmitting ? "Creating workspace" : "Create workspace and run agent"}
          >
            {isSubmitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Clapperboard className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="flex items-center gap-2">
            <span>Create Workspace</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
              <Command className="size-3" />
              <ArrowBigUp className="size-3" />
              <span className="text-xs">↵</span>
            </kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
