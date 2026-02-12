"use client";

import React, { useState, useCallback } from "react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  toastManager,
  Textarea,
} from "@workspace/ui";
import { Loader2, FilePlus } from "lucide-react";
import { shellQuote } from "@/lib/shell-quote";
import { systemApi } from "@/api/rest-api";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";

const PROJECT_WIKI_SPECIFY_SKILL_PATH = "~/.atmos/skills/.system/project-wiki-specify";

const AGENT_OPTIONS = [
  { id: "claude", label: "Claude Code", cmd: "claude", yoloFlag: "--dangerously-skip-permissions" },
  { id: "codex", label: "Codex", cmd: "codex", yoloFlag: "--dangerously-bypass-approvals-and-sandbox" },
  { id: "gemini", label: "Gemini", cmd: "gemini", yoloFlag: "-y" },
  { id: "amp", label: "Amp", cmd: "amp", yoloFlag: "-x" },
  { id: "droid", label: "Droid", cmd: "droid", yoloFlag: "" },
  { id: "opencode", label: "OpenCode", cmd: "opencode", yoloFlag: "--yolo" },
  { id: "kimi", label: "Kimi", cmd: "kimi", yoloFlag: "" },
  { id: "cursor", label: "Cursor Agent", cmd: "cursor", yoloFlag: "" },
  { id: "kilocode", label: "Kilo Code", cmd: "kilocode", yoloFlag: "" },
  { id: "kiro", label: "Kiro", cmd: "kiro", yoloFlag: "" },
] as const;

/** Generic topic templates — user replaces [xxx] with their project-specific terms */
const TOPIC_EXAMPLES = [
  "Explore how [feature name] is implemented",
  "Research why the project chose [technology] for [purpose]",
  "Understand how [module/component] works",
  "Document the [mechanism/flow] design",
  "Explain the design decision behind [architecture choice]",
];

function buildCommand(
  agentId: (typeof AGENT_OPTIONS)[number]["id"],
  prompt: string,
  useYolo: boolean
): string {
  const agent = AGENT_OPTIONS.find((a) => a.id === agentId);
  if (!agent) return "";

  const quoted = shellQuote(prompt);
  const parts = [agent.cmd];

  if (useYolo && agent.yoloFlag) {
    parts.push(agent.yoloFlag);
  }

  switch (agent.id) {
    case "amp":
      parts.push(quoted);
      break;
    default:
      parts.push(quoted);
  }

  return parts.join(" ");
}

function buildSpecifyPrompt(topic: string): string {
  const skillRef = `${PROJECT_WIKI_SPECIFY_SKILL_PATH}/SKILL.md`;
  return `Read the skill instructions at ${skillRef} and follow them to add a specified wiki article. You are in the project root. The user wants to generate a wiki article on this topic: "${topic}". The wiki is at ./.atmos/wiki/. Place the new article in the Specify Wiki section.`;
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
  const [agentId, setAgentId] = useState<(typeof AGENT_OPTIONS)[number]["id"]>("claude");
  const [isRunning, setIsRunning] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);

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
          description: "Switched to Terminal. Check progress there.",
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

    const prompt = buildSpecifyPrompt(trimmed);
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
  }, [topic, agentId, workspaceId, doRunSpecify]);

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
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                Code Agent
              </label>
              <Select value={agentId} onValueChange={(v) => setAgentId(v as typeof agentId)}>
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleRunSpecify} disabled={isRunning || !topic.trim()} className="cursor-pointer">
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
