"use client";

import { useTranslations } from "next-intl";
import {
  Check,
  Folder,
  MessagesSquare,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@workspace/ui";
import type { Project } from "@/shared/types/domain";
import {
  isThreadWorkingDirectory,
  resolveWorkingDirectoryLabel,
  THREAD_WORKING_DIRECTORY,
  type AgentChatWorkingDirectory,
} from "@/features/agent/lib/agent-chat-working-directory";

const GHOST_TRIGGER =
  "inline-flex h-8 max-w-[11rem] min-w-0 items-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs shadow-none hover:bg-muted/60 dark:bg-transparent dark:hover:bg-muted/60 data-[state=open]:bg-muted/60 dark:data-[state=open]:bg-muted/60";

export function AgentChatWorkingDirectoryPicker({
  projects,
  selection,
  onSelect,
  className,
}: {
  projects: Project[];
  selection: AgentChatWorkingDirectory;
  onSelect: (next: AgentChatWorkingDirectory) => void;
  className?: string;
}) {
  const t = useTranslations("Agent.components.composer.workingDirectory");
  const threadSelected = isThreadWorkingDirectory(selection);
  const label = resolveWorkingDirectoryLabel(selection, projects, t("thread"));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(GHOST_TRIGGER, className)}
          aria-label={t("aria")}
          title={label}
        >
          {threadSelected ? (
            <MessagesSquare className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 min-w-56">
        <DropdownMenuItem
          className="text-xs"
          onSelect={() => onSelect(THREAD_WORKING_DIRECTORY)}
        >
          {threadSelected ? <Check className="size-3.5" /> : <span className="size-3.5" />}
          <MessagesSquare className="size-3.5 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate">{t("thread")}</span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {t("threadDescription")}
            </span>
          </span>
        </DropdownMenuItem>
        {projects.length > 0 ? <DropdownMenuSeparator /> : null}
        {projects.map((project) => {
          const workspaces = project.workspaces.filter((workspace) => !workspace.isArchived);
          const projectSelected = !selection.workspaceId && selection.projectId === project.id;
          return (
            <DropdownMenuGroup key={project.id}>
              <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                {project.name}
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() =>
                  onSelect({
                    workspaceId: null,
                    projectId: project.id,
                    cwd: project.mainFilePath,
                  })
                }
              >
                {projectSelected ? <Check className="size-3.5" /> : <span className="size-3.5" />}
                <Folder className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 truncate">{project.name}</span>
              </DropdownMenuItem>
              {workspaces.map((workspace) => {
                const selected = selection.workspaceId === workspace.id;
                return (
                  <DropdownMenuItem
                    key={workspace.id}
                    className="text-xs"
                    onSelect={() =>
                      onSelect({
                        workspaceId: workspace.id,
                        projectId: project.id,
                        cwd: workspace.localPath,
                      })
                    }
                  >
                    {selected ? <Check className="size-3.5" /> : <span className="size-3.5" />}
                    <span className="min-w-0 truncate pl-4">
                      {workspace.displayName || workspace.name}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
