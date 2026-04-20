"use client";

import React, { useState, useCallback } from "react";
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
import { WIKI_LANGUAGE_OPTIONS } from "./wiki-languages";
import { systemApi } from "@/api/rest-api";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";
import { skillsApi } from "@/api/ws-api";

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
  const [agentId, setAgentId] = useState<AgentId>("claude");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBuildingAst, setIsBuildingAst] = useState(false);
  const [systemHasSkill, setSystemHasSkill] = useState<boolean | null>(null);
  const [skillLoading, setSkillLoading] = useState(true);
  const [language, setLanguage] = useState("en");
  const [customLanguage, setCustomLanguage] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);

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
    const command = buildCommand(agentId, prompt, true);
    navigator.clipboard.writeText(command);
    toastManager.add({
      title: "Copied to clipboard",
      description: "Paste and run this command in your Code Agent terminal.",
      type: "success",
    });
  }, [agentId, language, customLanguage]);

  const doRunGenerate = useCallback(
    (command: string) => {
      if (onSwitchToProjectWikiAndRun) {
        onSwitchToProjectWikiAndRun(command);
        toastManager.add({
          title: "Wiki generation started",
          description: "Switched to Project Wiki tab. Check progress there.",
          type: "info",
        });
      } else if (terminalGridRef.current?.createAndRunTerminal) {
        terminalGridRef.current.createAndRunTerminal({
          label: "Generate Project Wiki",
          command,
        });
        onSwitchToTerminal();
        toastManager.add({
          title: "Wiki generation started",
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
    },
    [terminalGridRef, onSwitchToTerminal, onSwitchToProjectWikiAndRun]
  );

  const handleGenerate = useCallback(async () => {
    if (!effectivePath) {
      toastManager.add({
        title: "Cannot generate",
        description: "Project path not available.",
        type: "error",
      });
      return;
    }

    const prompt = buildPrompt(language, customLanguage);
    const command = buildCommand(agentId, prompt, true);

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

      if (workspaceId) {
        setIsBuildingAst(true);
        try {
          const astResult = await systemApi.buildProjectWikiAst(workspaceId, effectivePath);
          toastManager.add({
            title: "AST indexing completed",
            description: `Indexed ${astResult.indexed_files} files, ${astResult.symbol_count} symbols, ${astResult.relation_count} relations.`,
            type: "success",
          });
        } catch (err) {
          toastManager.add({
            title: "AST indexing skipped",
            description:
              err instanceof Error
                ? `${err.message}. Wiki generation will continue in degraded mode.`
                : "Wiki generation will continue in degraded mode.",
            type: "warning",
          });
        } finally {
          setIsBuildingAst(false);
        }
      }

      doRunGenerate(command);
    } catch (_err) {
      setPendingCommand(command);
      setConflictDialogOpen(true);
    } finally {
      setIsGenerating(false);
    }
  }, [effectivePath, workspaceId, agentId, language, customLanguage, doRunGenerate]);

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
          <h2 className="text-lg font-semibold text-foreground">Generate Project Wiki</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create a navigable project wiki in{" "}
            <code className="text-xs bg-muted px-1 rounded">.atmos/wiki/</code> using a Code Agent.
          </p>
        </div>

        {/* Notices */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground space-y-2">
          <p className="font-medium">Before you start</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>
              Project Wiki generation takes <strong>10–30 minutes</strong>, depending on project
              complexity.
            </li>
            <li>
              To avoid frequent approval prompts, generation uses <strong>YOLO mode</strong> by
              default (auto-approve).
            </li>
          </ul>
        </div>

        {/* Skill install - show when ~/.atmos/skills/.system/project-wiki is missing */}
        {skillMissing && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              The project-wiki skill is not installed. Install it to use the full skill instructions.
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
                  Installing...
                </>
              ) : (
                <>
                  <Download className="size-4 mr-2" />
                  Install project-wiki skill
                </>
              )}
            </Button>
          </div>
        )}

        {skillLoading && <Skeleton className="h-4 w-3/4" />}

        {/* Code Agent */}
        <AgentSelect value={agentId} onValueChange={setAgentId} />

        {/* Language */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
            Wiki language
          </label>
          <div className="flex gap-2 flex-wrap">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WIKI_LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {language === "other" && (
              <Input
                placeholder="e.g. Italian, Vietnamese"
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
            disabled={isGenerating || isBuildingAst || skillMissing}
          >
            {isBuildingAst ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Building AST...
              </>
            ) : isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Starting...
              </>
            ) : (
              "Generate Wiki"
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleCopyPrompt}
            disabled={skillMissing}
            className="flex-1 sm:flex-none"
          >
            <Copy className="size-4 mr-2" />
            Copy prompt for agent
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          A new terminal tab will open and run the agent. Return to Wiki when done.
        </p>
      </div>

      {/* 冲突确认：检测到已有 Project Wiki 终端在运行时弹出 */}
      <Dialog open={conflictDialogOpen} onOpenChange={(open) => !open && (setConflictDialogOpen(false), setPendingCommand(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Project Wiki generation in progress
            </DialogTitle>
            <DialogDescription>
              A Project Wiki terminal is already running. Continuing will close it and start a new generation. Any in-progress work may be interrupted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-4">
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => (setConflictDialogOpen(false), setPendingCommand(null))}
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              onClick={handleConfirmReplaceAndGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Starting...
                </>
              ) : (
                "Replace & generate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
