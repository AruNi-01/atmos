"use client";

import React, { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  toastManager,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui";
import { BookOpen, Copy, Loader2, Download, AlertTriangle } from "lucide-react";
import { AgentSelect, buildCommand, type AgentId } from "./AgentSelect";
import { getWikiLanguageOptions } from "../lib/wiki-languages";
import { systemApi } from "@/api/rest-api";
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import { skillsApi } from "@/api/ws-api";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";

const PROJECT_WIKI_SKILL_PATH = "~/.atmos/skills/.system/project-wiki";

function buildPrompt(language: string, customLanguage: string): string {
  const lang = language === "other" ? customLanguage : language;
  const langInstruction = lang ? ` Generate all wiki content in ${lang}.` : "";

  const skillRef = `${PROJECT_WIKI_SKILL_PATH}/SKILL.md`;
  const initScript = `${PROJECT_WIKI_SKILL_PATH}/scripts/init_wiki_todo.sh`;

  return `Read the skill instructions at ${skillRef} and follow them to generate a complete project wiki. You are in the project root. Create the wiki in ./.atmos/wiki/.${langInstruction}

MANDATORY (do not skip):
1. First run: bash ${initScript} — this pre-creates .atmos/wiki/_todo.md
2. Maintain _todo.md throughout: update checkboxes as you complete each step
3. Before considering complete: validate_catalog, validate_frontmatter, and validate_todo must ALL pass
4. If Python unavailable: use bash ${PROJECT_WIKI_SKILL_PATH}/scripts/validate_catalog.sh and bash ${PROJECT_WIKI_SKILL_PATH}/scripts/validate_todo.sh`;
}

interface WikiSetupProps {
  effectivePath: string;
  workspaceId: string;
  terminalGridRef: React.RefObject<TerminalGridHandle | null>;
  onSwitchToTerminal: () => void;
  /** Switch to Project Wiki tab and run command (preferred over Terminal tab) */
  onSwitchToProjectWikiAndRun?: (command: string) => void;
  /** Kill existing Project Wiki window, remount terminal, then run (for conflict replace) */
  onProjectWikiReplaceAndRun?: (command: string) => Promise<void>;
  onRetryCheck: () => void;
}

export const WikiSetup: React.FC<WikiSetupProps> = ({
  effectivePath,
  workspaceId,
  terminalGridRef,
  onSwitchToTerminal,
  onSwitchToProjectWikiAndRun,
  onProjectWikiReplaceAndRun,
  onRetryCheck,
}) => {
  const t = useTranslations("wiki.setup");
  const [agentId, setAgentId] = useState<AgentId>("claude");
  const [agentRunConfigs, setAgentRunConfigs] = useState<Record<string, TerminalAgentRunConfigInput | null>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [systemHasSkill, setSystemHasSkill] = useState<boolean | null>(null);
  const [skillLoading, setSkillLoading] = useState(true);
  const [language, setLanguage] = useState("en");
  const [customLanguage, setCustomLanguage] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
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

  React.useEffect(() => {
    checkSystemSkill();
  }, [checkSystemSkill]);

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
        onRetryCheck();
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
  }, [checkSystemSkill, onRetryCheck]);

  const handleCopyPrompt = useCallback(() => {
    const prompt = buildPrompt(language, customLanguage);
    const command = buildCommand(agentId, prompt, currentAgentRunConfig);
    navigator.clipboard.writeText(command);
    toastManager.add({
      title: t("toasts.copiedTitle"),
      description: t("toasts.copiedDescription"),
      type: "success",
    });
  }, [agentId, currentAgentRunConfig, customLanguage, language, t]);

  const doRunGenerate = useCallback(
    (command: string) => {
      if (onSwitchToProjectWikiAndRun) {
        onSwitchToProjectWikiAndRun(command);
        toastManager.add({
          title: t("toasts.generationStartedTitle"),
          description: t("toasts.generationStartedDescription"),
          type: "info",
        });
      } else if (terminalGridRef.current?.createAndRunTerminal) {
        terminalGridRef.current.createAndRunTerminal({
          label: t("terminalLabel"),
          command,
        });
        onSwitchToTerminal();
        toastManager.add({
          title: t("toasts.generationStartedTitle"),
          description: t("toasts.generationStartedDescription"),
          type: "info",
        });
      } else {
        toastManager.add({
          title: t("toasts.terminalNotReadyTitle"),
          description: t("toasts.terminalNotReadyDescription"),
          type: "error",
        });
      }
    },
    [onSwitchToProjectWikiAndRun, onSwitchToTerminal, t, terminalGridRef]
  );

  const handleGenerate = useCallback(async () => {
    if (!effectivePath) {
      toastManager.add({
        title: t("toasts.cannotGenerateTitle"),
        description: t("toasts.cannotGenerateDescription"),
        type: "error",
      });
      return;
    }

    const prompt = buildPrompt(language, customLanguage);
    const command = buildCommand(agentId, prompt, currentAgentRunConfig);

    setIsGenerating(true);
    try {
      if (workspaceId) {
        const { exists } = await systemApi.checkProjectWikiWindow(workspaceId);
        if (exists) {
          setPendingCommand(command);
          setConflictDialogOpen(true);
          setIsGenerating(false);
          return;
        }
      }
      doRunGenerate(command);
    } catch (_err) {
      setPendingCommand(command);
      setConflictDialogOpen(true);
    } finally {
      setIsGenerating(false);
    }
  }, [agentId, currentAgentRunConfig, customLanguage, doRunGenerate, effectivePath, language, t, workspaceId]);

  const handleConfirmReplaceAndGenerate = useCallback(async () => {
    const cmd = pendingCommand;
    setPendingCommand(null);
    setConflictDialogOpen(false);
    if (!cmd) return;

    setIsGenerating(true);
    try {
      if (onProjectWikiReplaceAndRun) {
        await onProjectWikiReplaceAndRun(cmd);
      } else {
        if (workspaceId) {
          await systemApi.killProjectWikiWindow(workspaceId);
        }
        doRunGenerate(cmd);
      }
    } catch (err) {
      toastManager.add({
        title: "Failed to close previous terminal",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [workspaceId, pendingCommand, doRunGenerate, onProjectWikiReplaceAndRun]);

  // 仅当明确检测到已安装时才隐藏；加载中或检测失败时都显示安装入口
  const skillMissing = systemHasSkill !== true;

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 max-w-2xl mx-auto">
      {/* No Card border - plain center content */}
      <div className="w-full space-y-6">
        <div className="text-center">
          <div className="size-12 mx-auto mb-3 rounded-xl bg-muted flex items-center justify-center">
            <BookOpen className="size-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("descriptionPrefix")}{" "}
            <code className="text-xs bg-muted px-1 rounded">.atmos/wiki/</code>{" "}
            {t("descriptionSuffix")}
          </p>
        </div>

        {/* Notices */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground space-y-2">
          <p className="font-medium">{t("notices.title")}</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>
              {t.rich("notices.estimatedDuration", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
            <li>
              {t.rich("notices.approvalMode", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
          </ul>
        </div>

        {/* Skill install - show when ~/.atmos/skills/.system/project-wiki is missing */}
        {skillMissing && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("skillMissing.description")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallSkill}
              disabled={isInstalling}
              className="w-full sm:w-auto"
            >
              {isInstalling ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  {t("skillMissing.installing")}
                </>
              ) : (
                <>
                  <Download className="size-4 mr-2" />
                  {t("skillMissing.installButton")}
                </>
              )}
            </Button>
          </div>
        )}

        {skillLoading && <Skeleton className="h-4 w-3/4" />}

        {/* Code Agent */}
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

        {/* Language */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
            {t("languageLabel")}
          </label>
          <div className="flex gap-2 flex-wrap">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getWikiLanguageOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {language === "other" && (
              <Input
                placeholder={t("customLanguagePlaceholder")}
                value={customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
                className="flex-1 min-w-[120px]"
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            className="flex-1"
            onClick={handleGenerate}
            disabled={isGenerating || skillMissing}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                {t("actions.starting")}
              </>
            ) : (
              t("actions.generate")
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleCopyPrompt}
            disabled={skillMissing}
            className="flex-1 sm:flex-none"
          >
            <Copy className="size-4 mr-2" />
            {t("actions.copyPrompt")}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          {t("footnote")}
        </p>
      </div>

      {/* 冲突确认：检测到已有 Project Wiki 终端在运行时弹出 */}
      <Dialog open={conflictDialogOpen} onOpenChange={(open) => !open && (setConflictDialogOpen(false), setPendingCommand(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              {t("conflictDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {t("conflictDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-4">
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => (setConflictDialogOpen(false), setPendingCommand(null))}
            >
              {t("conflictDialog.cancel")}
            </Button>
            <Button
              className="cursor-pointer"
              onClick={handleConfirmReplaceAndGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  {t("actions.starting")}
                </>
              ) : (
                t("conflictDialog.confirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
