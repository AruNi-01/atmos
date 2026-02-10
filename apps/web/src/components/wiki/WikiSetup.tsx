"use client";

import React, { useState, useCallback } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toastManager,
} from "@workspace/ui";
import { BookOpen, Loader2 } from "lucide-react";
import { shellQuote } from "@/lib/shell-quote";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";
import { skillsApi } from "@/api/ws-api";

const AGENT_OPTIONS = [
  { id: "claude", label: "Claude Code", cmd: "claude" },
  { id: "codex", label: "Codex CLI", cmd: "codex" },
  { id: "aider", label: "Aider", cmd: "aider" },
] as const;

function buildCommand(
  agentId: (typeof AGENT_OPTIONS)[number]["id"],
  prompt: string
): string {
  const agent = AGENT_OPTIONS.find((a) => a.id === agentId);
  if (!agent) return "";

  const quoted = shellQuote(prompt);

  switch (agent.id) {
    case "claude":
      return `${agent.cmd} ${quoted}`;
    case "codex":
      return `${agent.cmd} ${quoted}`;
    case "aider":
      return `${agent.cmd} --message ${quoted}`;
    default:
      return `${agent.cmd} ${quoted}`;
  }
}

interface WikiSetupProps {
  effectivePath: string;
  terminalGridRef: React.RefObject<TerminalGridHandle | null>;
  onSwitchToTerminal: () => void;
  onRetryCheck: () => void;
}

export const WikiSetup: React.FC<WikiSetupProps> = ({
  effectivePath,
  terminalGridRef,
  onSwitchToTerminal,
  onRetryCheck,
}) => {
  const [agentId, setAgentId] = useState<(typeof AGENT_OPTIONS)[number]["id"]>("claude");
  const [isGenerating, setIsGenerating] = useState(false);
  const [skillPath, setSkillPath] = useState<string | null>(null);
  const [skillLoading, setSkillLoading] = useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { skills } = await skillsApi.list();
        const projectWiki = skills.find(
          (s) => s.name === "project-wiki" || s.name?.toLowerCase().includes("project-wiki")
        );
        if (cancelled) return;
        if (projectWiki) {
          const mainFile = projectWiki.files?.find((f) => f.is_main) ?? projectWiki.files?.[0];
          setSkillPath(mainFile?.absolute_path ?? projectWiki.path);
        }
      } catch {
        // Fallback: generic prompt without skill path
      } finally {
        if (!cancelled) setSkillLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!effectivePath || !terminalGridRef.current) {
      toastManager.add({
        title: "Cannot generate",
        description: "Project path or terminal not available.",
        type: "error",
      });
      return;
    }

    const prompt = skillPath
      ? `Read the skill instructions at ${skillPath} and follow them to generate a complete project wiki. You are in the project root. Create the wiki in ./.atmos/wiki/`
      : "Generate a complete project wiki in ./.atmos/wiki/. Create _catalog.json and markdown files per the project-wiki convention. Analyze the codebase and document key modules.";

    const command = buildCommand(agentId, prompt);

    setIsGenerating(true);
    try {
      const handle = terminalGridRef.current;
      if (typeof handle.createAndRunTerminal === "function") {
        await handle.createAndRunTerminal({
          title: "Project Wiki",
          command,
        });
        onSwitchToTerminal();
        toastManager.add({
          title: "Wiki generation started",
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
    } catch (err) {
      toastManager.add({
        title: "Failed to start",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [effectivePath, agentId, skillPath, terminalGridRef, onSwitchToTerminal]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
      <Card className="w-full max-w-md border border-border bg-background">
        <CardHeader className="text-center pb-2">
          <div className="size-12 mx-auto mb-3 rounded-xl bg-muted flex items-center justify-center">
            <BookOpen className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">Generate Project Wiki</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Create a navigable project wiki in <code className="text-xs bg-muted px-1 rounded">.atmos/wiki/</code> using a Code Agent.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
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
          {skillLoading && (
            <Skeleton className="h-4 w-3/4" />
          )}
          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Starting...
              </>
            ) : (
              "Generate Wiki"
            )}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            A new terminal tab will open and run the agent. Return to Wiki when done.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
