"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  toastManager,
} from "@workspace/ui";
import { Download, Loader2, LoaderCircle, RotateCw } from "lucide-react";
import { systemApi } from "@/api/rest-api";
import { skillsApi } from "@/api/ws-api";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";
import { AgentSelect, buildCommand, type AgentId } from "./AgentSelect";

const PROJECT_WIKI_UPDATE_SKILL_PATH = "~/.atmos/skills/.system/project-wiki-update";

function buildUpdatePrompt(catalogCommit: string, currentCommit: string): string {
  const skillRef = `${PROJECT_WIKI_UPDATE_SKILL_PATH}/SKILL.md`;
  return `Read the skill instructions at ${skillRef} and follow them to incrementally update the project wiki at ./.atmos/wiki/. The wiki was generated at commit ${catalogCommit}. Current HEAD is ${currentCommit}.`;
}

interface WikiUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  effectivePath: string;
  catalogCommit: string;
  currentCommit: string;
  /** Commits between catalog and current HEAD (for hint) */
  commitCount?: number;
  workspaceId: string;
  terminalGridRef?: React.RefObject<TerminalGridHandle | null>;
  onSwitchToTerminal?: () => void;
  onSwitchToProjectWikiAndRun?: (command: string) => void;
  onProjectWikiReplaceAndRun?: (command: string) => Promise<void>;
  onComplete?: () => void;
}

export const WikiUpdateDialog: React.FC<WikiUpdateDialogProps> = ({
  open,
  onOpenChange,
  effectivePath,
  catalogCommit,
  currentCommit,
  commitCount,
  workspaceId,
  terminalGridRef,
  onSwitchToTerminal,
  onSwitchToProjectWikiAndRun,
  onProjectWikiReplaceAndRun,
  onComplete,
}) => {
  const [agentId, setAgentId] = useState<AgentId>("claude");
  const [isRunning, setIsRunning] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [systemHasSkill, setSystemHasSkill] = useState<boolean | null>(null);
  const [skillLoading, setSkillLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);

  const checkSystemSkill = useCallback(async () => {
    setSkillLoading(true);
    setSystemHasSkill(null);
    try {
      const installed = await skillsApi.isProjectWikiInstalledInSystem();
      setSystemHasSkill(installed);
    } catch {
      setSystemHasSkill(false);
    } finally {
      setSkillLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) checkSystemSkill();
  }, [open, checkSystemSkill]);

  const handleInstallSkill = useCallback(async () => {
    setIsInstalling(true);
    try {
      const result = await skillsApi.installProjectWiki();
      if (result.success) {
        toastManager.add({
          title: "Skill installed",
          description: result.message,
          type: "success",
        });
        await checkSystemSkill();
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      toastManager.add({
        title: "Install failed",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsInstalling(false);
    }
  }, [checkSystemSkill]);

  const doRunUpdate = useCallback(
    (command: string) => {
      if (onSwitchToProjectWikiAndRun) {
        onSwitchToProjectWikiAndRun(command);
        toastManager.add({
          title: "Wiki update started",
          description: "Switched to Project Wiki tab. Check progress there.",
          type: "info",
        });
      } else if (terminalGridRef?.current?.createAndRunTerminal) {
        terminalGridRef.current.createAndRunTerminal({
          label: "Generate Project Wiki",
          command,
        });
        onSwitchToTerminal?.();
        toastManager.add({
          title: "Wiki update started",
          description: "Switched to Project Wiki tab. Check progress there.",
          type: "info",
        });
      } else {
        toastManager.add({
          title: "Terminal not ready",
          description: "Please wait and try again.",
          type: "error",
        });
      }
      onComplete?.();
      onOpenChange(false);
    },
    [
      terminalGridRef,
      onSwitchToTerminal,
      onSwitchToProjectWikiAndRun,
      onComplete,
      onOpenChange,
    ]
  );

  const handleRunUpdate = useCallback(async () => {
    const prompt = buildUpdatePrompt(catalogCommit, currentCommit);
    const command = buildCommand(agentId, prompt);

    setIsRunning(true);
    try {
      if (workspaceId) {
        const { exists } = await systemApi.checkProjectWikiWindow(workspaceId);
        if (exists) {
          setPendingCommand(command);
          setConflictDialogOpen(true);
          setIsRunning(false);
          return;
        }
      }
      doRunUpdate(command);
    } catch {
      setPendingCommand(command);
      setConflictDialogOpen(true);
    } finally {
      setIsRunning(false);
    }
  }, [agentId, catalogCommit, currentCommit, workspaceId, doRunUpdate]);

  const handleConfirmReplaceAndRun = useCallback(async () => {
    const cmd = pendingCommand;
    setPendingCommand(null);
    setConflictDialogOpen(false);
    if (!cmd) return;

    setIsRunning(true);
    try {
      if (onProjectWikiReplaceAndRun) {
        await onProjectWikiReplaceAndRun(cmd);
      } else if (workspaceId) {
        await systemApi.killProjectWikiWindow(workspaceId);
      }
      doRunUpdate(cmd);
    } catch (err) {
      toastManager.add({
        title: "Failed to close previous terminal",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsRunning(false);
    }
  }, [workspaceId, pendingCommand, doRunUpdate, onProjectWikiReplaceAndRun]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCw className="size-5 text-foreground" />
              Update Project Wiki
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-muted-foreground text-sm">
                <p>
                  Code has changed since the wiki was generated. Run an incremental update to regenerate
                  only the affected pages.
                </p>
                {typeof commitCount === "number" && commitCount > 0 && (
                  <p className="rounded-md bg-muted/60 px-3 py-2 text-muted-foreground">
                    Current Wiki is <span className="font-semibold text-foreground">{commitCount}</span> commit{commitCount === 1 ? "" : "s"} behind the latest code repository.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {(skillLoading || systemHasSkill !== true) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  {skillLoading
                    ? "Checking wiki skills..."
                    : "Wiki skills (project-wiki, project-wiki-update) are not installed."}
                </p>
                {!skillLoading && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleInstallSkill}
                    disabled={isInstalling}
                    className="cursor-pointer"
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 className="size-4 animate-spin mr-2" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <Download className="size-4 mr-2" />
                        Install wiki skills
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
            <AgentSelect value={agentId} onValueChange={setAgentId} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning}>
              Cancel
            </Button>
            <Button
              onClick={handleRunUpdate}
              disabled={isRunning || systemHasSkill !== true}
            >
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Starting...
                </>
              ) : (
                <>
                  <RotateCw className="size-4 mr-2" />
                                     Update Wiki
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={conflictDialogOpen}
        onOpenChange={(o) => !o && (setConflictDialogOpen(false), setPendingCommand(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project Wiki generation in progress</DialogTitle>
            <DialogDescription>
              A Project Wiki terminal is already running. Continuing will close it and start the
              update. Any in-progress work may be interrupted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setConflictDialogOpen(false), setPendingCommand(null))}>
              Cancel
            </Button>
            <Button onClick={handleConfirmReplaceAndRun} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Starting...
                </>
              ) : (
                "Replace & update"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
