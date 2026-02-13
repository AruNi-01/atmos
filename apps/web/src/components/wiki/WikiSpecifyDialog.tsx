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
  Textarea,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import { Download, Loader2, FilePlus } from "lucide-react";
import { AgentSelect, buildCommand, type AgentId } from "./AgentSelect";
import { WIKI_LANGUAGE_OPTIONS } from "./wiki-languages";
import { systemApi } from "@/api/rest-api";
import { skillsApi } from "@/api/ws-api";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";

const PROJECT_WIKI_SPECIFY_SKILL_PATH = "~/.atmos/skills/.system/project-wiki-specify";

/** Generic topic templates — user replaces [xxx] with their project-specific terms */
const TOPIC_EXAMPLES = [
  "Explore how [feature name] is implemented",
  "Research why the project chose [technology] for [purpose]",
  "Understand how [module/component] works",
  "Document the [mechanism/flow] design",
  "Explain the design decision behind [architecture choice]",
];

function buildSpecifyPrompt(topic: string, language: string, customLanguage: string): string {
  const lang = language === "other" ? customLanguage : language;
  const langInstruction = lang ? ` Generate the article in ${lang}.` : "";
  const skillRef = `${PROJECT_WIKI_SPECIFY_SKILL_PATH}/SKILL.md`;
  return `Read the skill instructions at ${skillRef} and follow them to add a specified wiki article. You are in the project root. The user wants to generate a wiki article on this topic: "${topic}". The wiki is at ./.atmos/wiki/. Place the new article in the Specify Wiki section.${langInstruction}`;
}

interface WikiSpecifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  effectivePath: string;
  workspaceId: string;
  terminalGridRef?: React.RefObject<TerminalGridHandle | null>;
  onSwitchToTerminal?: () => void;
  onSwitchToProjectWikiAndRun?: (command: string) => void;
  onProjectWikiReplaceAndRun?: (command: string) => Promise<void>;
  onComplete?: () => void;
}

export const WikiSpecifyDialog: React.FC<WikiSpecifyDialogProps> = ({
  open,
  onOpenChange,
  workspaceId,
  terminalGridRef,
  onSwitchToTerminal,
  onSwitchToProjectWikiAndRun,
  onProjectWikiReplaceAndRun,
  onComplete,
}) => {
  const [topic, setTopic] = useState("");
  const [agentId, setAgentId] = useState<AgentId>("claude");
  const [language, setLanguage] = useState("en");
  const [customLanguage, setCustomLanguage] = useState("");
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

  const doRunSpecify = useCallback(
    (command: string) => {
      if (onSwitchToProjectWikiAndRun) {
        onSwitchToProjectWikiAndRun(command);
        toastManager.add({
          title: "Specify Wiki started",
          description: "Switched to Project Wiki tab. Check progress there.",
          type: "info",
        });
      } else if (terminalGridRef?.current?.createAndRunTerminal) {
        terminalGridRef.current.createAndRunTerminal({
          title: "Specify Project Wiki",
          command,
        });
        onSwitchToTerminal?.();
        toastManager.add({
          title: "Specify Wiki started",
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

  const handleRunSpecify = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed) {
      toastManager.add({
        title: "Topic required",
        description: "Please enter a topic for the wiki article.",
        type: "error",
      });
      return;
    }

    const prompt = buildSpecifyPrompt(trimmed, language, customLanguage);
    const command = buildCommand(agentId, prompt, true);

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
      doRunSpecify(command);
    } catch {
      setPendingCommand(command);
      setConflictDialogOpen(true);
    } finally {
      setIsRunning(false);
    }
  }, [topic, agentId, language, customLanguage, workspaceId, doRunSpecify]);

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
      doRunSpecify(cmd);
    } catch (err) {
      toastManager.add({
        title: "Failed to close previous terminal",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsRunning(false);
    }
  }, [workspaceId, pendingCommand, doRunSpecify, onProjectWikiReplaceAndRun]);

  const handleExampleClick = (example: string) => {
    setTopic(example);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="size-5 text-muted-foreground" />
              Specify Wiki
            </DialogTitle>
            <DialogDescription>
              Generate a focused wiki article on a specific topic. The article will be added to the
              Specify Wiki section, separate from Getting Started and Deep Dive.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {(skillLoading || systemHasSkill !== true) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  {skillLoading
                    ? "Checking wiki skills..."
                    : "Wiki skills (project-wiki, project-wiki-specify) are not installed."}
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
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                Topic
              </label>
              <Textarea
                placeholder="e.g., Explore how [feature] is implemented"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Examples (click to use):</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {TOPIC_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => handleExampleClick(ex)}
                    className="text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground truncate max-w-[280px] cursor-pointer"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
            <AgentSelect value={agentId} onValueChange={setAgentId} />
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                Article language
              </label>
              <div className="flex gap-2 flex-wrap">
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-full sm:w-48 cursor-pointer">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              onClick={handleRunSpecify}
              disabled={isRunning || !topic.trim() || systemHasSkill !== true}
              className="cursor-pointer"
            >
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Starting...
                </>
              ) : (
                <>
                  <FilePlus className="size-4 mr-2" />
                  Generate Article
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
              specify task. Any in-progress work may be interrupted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setConflictDialogOpen(false), setPendingCommand(null))} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleConfirmReplaceAndRun} disabled={isRunning} className="cursor-pointer">
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Starting...
                </>
              ) : (
                "Replace & run"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
