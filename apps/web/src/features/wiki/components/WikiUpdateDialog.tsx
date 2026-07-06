"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
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
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import { AgentSelect, buildWikiTerminalRun, toTerminalPaneAgent, type AgentId, type WikiTerminalRun } from "./AgentSelect";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";

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
  onSwitchToProjectWikiAndRun?: (run: WikiTerminalRun) => void;
  onProjectWikiReplaceAndRun?: (run: WikiTerminalRun) => Promise<void>;
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
  const t = useTranslations("wiki.updateDialog");
  const [agentId, setAgentId] = useState<AgentId>("claude");
  const [agentRunConfigs, setAgentRunConfigs] = useState<Record<string, TerminalAgentRunConfigInput | null>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<WikiTerminalRun | null>(null);
  const [systemHasSkill, setSystemHasSkill] = useState<boolean | null>(null);
  const [skillLoading, setSkillLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const currentAgentRunConfig = agentRunConfigs[agentId] ?? null;

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
          title: t("toasts.skillInstalled.title"),
          description: result.message,
          type: "success",
        });
        await checkSystemSkill();
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      toastManager.add({
        title: t("toasts.installFailed.title"),
        description: err instanceof Error ? err.message : t("errors.unknown"),
        type: "error",
      });
    } finally {
      setIsInstalling(false);
    }
  }, [checkSystemSkill]);

  const doRunUpdate = useCallback(
    (run: WikiTerminalRun) => {
      if (onSwitchToProjectWikiAndRun) {
        onSwitchToProjectWikiAndRun(run);
        toastManager.add({
          title: t("toasts.started.title"),
          description: t("toasts.started.description"),
          type: "info",
        });
      } else if (terminalGridRef?.current?.createAndRunTerminal) {
        terminalGridRef.current.createAndRunTerminal({
          label: t("terminalLabel"),
          command: run.command,
          tuiFollowUpPrompt: run.tuiFollowUpPrompt,
          agent: toTerminalPaneAgent(run.agentId),
        });
        onSwitchToTerminal?.();
        toastManager.add({
          title: t("toasts.started.title"),
          description: t("toasts.started.description"),
          type: "info",
        });
      } else {
        toastManager.add({
          title: t("toasts.terminalNotReady.title"),
          description: t("toasts.terminalNotReady.description"),
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
      t,
    ]
  );

  const handleRunUpdate = useCallback(async () => {
    const prompt = buildUpdatePrompt(catalogCommit, currentCommit);
    const run = buildWikiTerminalRun(agentId, prompt, currentAgentRunConfig);

    setIsRunning(true);
    try {
      if (workspaceId) {
        const { exists } = await systemApi.checkProjectWikiWindow(workspaceId);
        if (exists) {
          setPendingCommand(run);
          setConflictDialogOpen(true);
          setIsRunning(false);
          return;
        }
      }
      doRunUpdate(run);
    } catch {
      setPendingCommand(run);
      setConflictDialogOpen(true);
    } finally {
      setIsRunning(false);
    }
  }, [agentId, currentAgentRunConfig, catalogCommit, currentCommit, workspaceId, doRunUpdate]);

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
        title: t("toasts.closePreviousFailed.title"),
        description: err instanceof Error ? err.message : t("errors.unknown"),
        type: "error",
      });
    } finally {
      setIsRunning(false);
    }
  }, [workspaceId, pendingCommand, doRunUpdate, onProjectWikiReplaceAndRun, t]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCw className="size-5 text-foreground" />
              {t("title")}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-muted-foreground text-sm">
                <p>
                  {t("description")}
                </p>
                {typeof commitCount === "number" && commitCount > 0 && (
                  <p className="rounded-md bg-muted/60 px-3 py-2 text-muted-foreground">
                    {t.rich("commitCount", {
                      count: commitCount,
                      strong: (chunks) => (
                        <span className="font-semibold text-foreground">{chunks}</span>
                      ),
                    })}
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
                    ? t("skills.checking")
                    : t("skills.notInstalled")}
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
                          {t("skills.installing")}
                        </>
                      ) : (
                        <>
                          <Download className="size-4 mr-2" />
                          {t("skills.install")}
                        </>
                      )}
                  </Button>
                )}
              </div>
            )}
            <AgentSelect
              value={agentId}
              onValueChange={setAgentId}
              enableRunConfig
              runConfig={currentAgentRunConfig}
              runConfigByAgentId={agentRunConfigs}
              onRunConfigChange={(nextAgentId, nextValue) => {
                setAgentRunConfigs((prev) => ({
                  ...prev,
                  [nextAgentId]: nextValue,
                }));
                setAgentId(nextAgentId);
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning}>
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={handleRunUpdate}
              disabled={isRunning || systemHasSkill !== true}
            >
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  {t("actions.starting")}
                </>
              ) : (
                <>
                  <RotateCw className="size-4 mr-2" />
                  {t("actions.updateWiki")}
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
            <DialogTitle>{t("conflict.title")}</DialogTitle>
            <DialogDescription>
              {t("conflict.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setConflictDialogOpen(false), setPendingCommand(null))}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleConfirmReplaceAndRun} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  {t("actions.starting")}
                </>
              ) : (
                t("actions.replaceAndUpdate")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
