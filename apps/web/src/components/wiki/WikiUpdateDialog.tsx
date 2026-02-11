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
} from "@workspace/ui";
import { Loader2, RefreshCw } from "lucide-react";
import { shellQuote } from "@/lib/shell-quote";
import { systemApi } from "@/api/rest-api";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";

const PROJECT_WIKI_UPDATE_SKILL_PATH = "~/.atmos/skills/.system/project-wiki-update";

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
  workspaceId,
  terminalGridRef,
  onSwitchToTerminal,
  onSwitchToProjectWikiAndRun,
  onProjectWikiReplaceAndRun,
  onComplete,
}) => {
  const [agentId, setAgentId] = useState<(typeof AGENT_OPTIONS)[number]["id"]>("claude");
  const [isRunning, setIsRunning] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);

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
          title: "Generate Project Wiki",
          command,
        });
        onSwitchToTerminal?.();
        toastManager.add({
          title: "Wiki update started",
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

  const handleRunUpdate = useCallback(async () => {
    const prompt = buildUpdatePrompt(catalogCommit, currentCommit);
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
              <RefreshCw className="size-5 text-amber-500" />
              Update Project Wiki
            </DialogTitle>
            <DialogDescription>
              Code has changed since the wiki was generated. Run an incremental update to regenerate
              only the affected pages.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                Code Agent
              </label>
              <Select value={agentId} onValueChange={(v) => setAgentId(v as typeof agentId)}>
                <SelectTrigger className="w-full">
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
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning}>
              Cancel
            </Button>
            <Button onClick={handleRunUpdate} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Starting...
                </>
              ) : (
                <>
                  <RefreshCw className="size-4 mr-2" />
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
