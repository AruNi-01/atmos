"use client";

import React from "react";
import { toastManager } from "@workspace/ui";
import { useAgentFixLauncherStore } from "@/features/agent-fix/store/agent-fix-launcher-store";
import { resolveAgentFixPrompt } from "@/features/agent-fix/lib/agent-fix-prompt";
import type {
  AgentFixAgentOption,
  AgentFixPromptSource,
} from "@/features/agent-fix/types";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";

export function useAgentFixActions({
  agent,
  runConfig,
  rememberAgent,
  source,
}: {
  agent: AgentFixAgentOption | null;
  runConfig: TerminalAgentRunConfigInput | null;
  rememberAgent: (agentId: string) => void;
  source: AgentFixPromptSource;
}) {
  const runner = useAgentFixLauncherStore((state) => state.runner);
  const [isCopying, setIsCopying] = React.useState(false);
  const [isLaunching, setIsLaunching] = React.useState(false);

  const handleError = React.useCallback(
    (error: unknown, title: string) => {
      source.onError?.(error);
      toastManager.add({
        title,
        description: error instanceof Error ? error.message : "Unknown Agent Fix error",
        type: "error",
      });
    },
    [source],
  );

  const copyPrompt = React.useCallback(async () => {
    setIsCopying(true);
    try {
      const result = await resolveAgentFixPrompt(source);
      await navigator.clipboard.writeText(result.clipboardText ?? result.prompt);
      await source.onCopied?.(result);
    } catch (error) {
      handleError(error, "Failed to copy prompt");
    } finally {
      setIsCopying(false);
    }
  }, [handleError, source]);

  const launchAgentFix = React.useCallback(async () => {
    if (!agent) {
      handleError(new Error("No terminal agent is available."), "Agent Fix unavailable");
      return;
    }
    if (!source.context) {
      handleError(new Error("No active workspace or project context."), "Agent Fix unavailable");
      return;
    }

    setIsLaunching(true);
    try {
      const result = await resolveAgentFixPrompt(source);
      rememberAgent(agent.id);
      if (!runner) {
        await navigator.clipboard.writeText(result.clipboardText ?? result.prompt);
        toastManager.add({
          title: "Prompt copied",
          description: "No terminal launcher is active, so the Agent Fix prompt was copied instead.",
          type: "success",
        });
        await source.onCopied?.(result);
        return;
      }
      await runner({
        context: source.context,
        prompt: result.prompt,
        agent,
        runConfig,
        terminalTabTitle: result.terminalTabTitle ?? source.label,
        terminalPaneLabel: result.terminalPaneLabel ?? agent.label,
      });
      await source.onStarted?.(result);
      toastManager.add({
        title: "Agent Fix started",
        description: "A terminal agent session was opened with the fix prompt.",
        type: "success",
      });
    } catch (error) {
      handleError(error, "Failed to start Agent Fix");
    } finally {
      setIsLaunching(false);
    }
  }, [agent, handleError, rememberAgent, runConfig, runner, source]);

  return {
    copyPrompt,
    isCopying,
    isLaunching,
    launchAgentFix,
  };
}
