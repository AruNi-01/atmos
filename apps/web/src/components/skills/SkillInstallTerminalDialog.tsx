"use client";

import React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toastManager,
} from "@workspace/ui";
import { AlertCircle, Copy, ExternalLink, SquareTerminal } from "lucide-react";
import { Terminal, type TerminalRef } from "@/components/terminal/Terminal";
import { useGitInfoStore } from "@/hooks/use-git-info-store";
import { useProjectStore } from "@/hooks/use-project-store";
import {
  buildSkillInstallCommand,
  hasInferredDownloadUrl,
  resolveSkillSourceUrl,
  type SkillMarketItem,
} from "./market-data";

interface SkillInstallTerminalDialogProps {
  open: boolean;
  skill: SkillMarketItem | null;
  onOpenChange: (open: boolean) => void;
}

export const SkillInstallTerminalDialog: React.FC<SkillInstallTerminalDialogProps> = ({
  open,
  skill,
  onOpenChange,
}) => {
  const terminalRef = React.useRef<TerminalRef | null>(null);
  const startedRef = React.useRef(false);
  const { currentProjectId, currentWorkspaceId, currentProjectPath } = useGitInfoStore();
  const { projects } = useProjectStore();
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionError, setSessionError] = React.useState<string | null>(null);

  const contextId = currentWorkspaceId || currentProjectId;
  let terminalContext: {
    workspaceId: string | null;
    projectName?: string;
    workspaceName?: string;
    cwd?: string;
  } = {
    workspaceId: contextId,
    projectName: undefined,
    workspaceName: undefined,
    cwd: currentProjectPath || undefined,
  };

  if (!contextId) {
    terminalContext = {
      workspaceId: null,
      projectName: undefined,
      workspaceName: undefined,
      cwd: currentProjectPath || undefined,
    };
  } else {
    for (const project of projects) {
      const workspace = project.workspaces.find((item) => item.id === contextId);
      if (workspace) {
        terminalContext = {
          workspaceId: workspace.id,
          projectName: project.name,
          workspaceName: workspace.name,
          cwd: currentProjectPath || workspace.localPath,
        };
        break;
      }

      if (project.id === contextId) {
        terminalContext = {
          workspaceId: project.id,
          projectName: project.name,
          workspaceName: "Main",
          cwd: currentProjectPath || project.mainFilePath,
        };
        break;
      }
    }
  }

  const command = skill ? buildSkillInstallCommand(skill.downloadUrl) : "";

  React.useEffect(() => {
    if (!open || !skill) {
      startedRef.current = false;
      setSessionId(null);
      setSessionError(null);
      return;
    }

    startedRef.current = false;
    setSessionError(null);
    setSessionId(`skills-install-${terminalContext.workspaceId || "detached"}-${skill.id}-${Date.now()}`);
  }, [open, skill, terminalContext.workspaceId]);

  const closeDialog = React.useCallback(() => {
    terminalRef.current?.destroy();
    onOpenChange(false);
  }, [onOpenChange]);

  const handleCopyCommand = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      toastManager.add({
        title: "Command copied",
        description: "Install command copied to clipboard.",
        type: "success",
      });
    } catch {
      toastManager.add({
        title: "Copy failed",
        description: "Clipboard is not available.",
        type: "error",
      });
    }
  }, [command]);

  if (!skill) {
    return null;
  }

  const sourceUrl = resolveSkillSourceUrl(skill);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
        }
      }}
    >
      <DialogContent showCloseButton={true} className="w-[min(1100px,calc(100vw-2rem))] max-w-[1100px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <SquareTerminal className="size-4.5 text-primary" />
            Install {skill.title}
          </DialogTitle>
          <DialogDescription className="pr-12">
            A temporary shell terminal runs <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{command}</code>. Complete any interactive prompts, then close this dialog yourself.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyCommand} className="cursor-pointer">
              <Copy className="mr-1.5 size-3.5" />
              Copy Command
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")}
              className="cursor-pointer"
            >
              <ExternalLink className="mr-1.5 size-3.5" />
              Open Source
            </Button>
            {hasInferredDownloadUrl(skill) && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Install URL inferred from relative markdown link
              </span>
            )}
          </div>

          {!terminalContext.workspaceId ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertCircle className="size-7" />
              </div>
              <h3 className="text-base font-semibold text-foreground">No project context available</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground text-pretty">
                Open any project or workspace first so Atmos knows which directory to use for this temporary terminal session.
              </p>
              <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                {command}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
                <span className="truncate">
                  {terminalContext.projectName || "Temporary Terminal"}
                  {terminalContext.workspaceName ? ` / ${terminalContext.workspaceName}` : ""}
                </span>
                <span className="truncate text-right">{terminalContext.cwd || "~"}</span>
              </div>

              <div className="h-[520px] bg-background">
                {sessionId && (
                  <Terminal
                    ref={terminalRef}
                    sessionId={sessionId}
                    workspaceId={terminalContext.workspaceId}
                    projectName={terminalContext.projectName}
                    workspaceName={terminalContext.workspaceName}
                    terminalName={`skills-install-${skill.id}`}
                    noTmux={true}
                    cwd={terminalContext.cwd}
                    onSessionReady={() => {
                      if (startedRef.current) {
                        return;
                      }
                      startedRef.current = true;
                      terminalRef.current?.sendText(`${command}\r`);
                    }}
                    onSessionError={(_, error) => {
                      setSessionError(error);
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {sessionError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {sessionError}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
