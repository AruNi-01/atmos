"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("agent.fixActions");
  const runner = useAgentFixLauncherStore((state) => state.runner);
  const [isCopying, setIsCopying] = React.useState(false);
  const [isLaunching, setIsLaunching] = React.useState(false);

  const handleError = React.useCallback(
    (error: unknown, title: string) => {
      source.onError?.(error);
      toastManager.add({
        title,
        description: error instanceof Error ? error.message : t("unknownError"),
        type: "error",
      });
    },
    [source, t],
  );

  const copyPrompt = React.useCallback(async () => {
    setIsCopying(true);
    try {
      const result = await resolveAgentFixPrompt(source);
      await navigator.clipboard.writeText(result.clipboardText ?? result.prompt);
      await source.onCopied?.(result);
    } catch (error) {
      handleError(error, t("toasts.copyFailed.title"));
    } finally {
      setIsCopying(false);
    }
  }, [handleError, source, t]);

  const launchAgentFix = React.useCallback(async () => {
    if (!agent) {
      handleError(new Error(t("errors.noTerminalAgent")), t("toasts.unavailable.title"));
      return;
    }
    if (!source.context) {
      handleError(new Error(t("errors.noContext")), t("toasts.unavailable.title"));
      return;
    }

    setIsLaunching(true);
    try {
      const result = await resolveAgentFixPrompt(source);
      rememberAgent(agent.id);
      if (!runner) {
        await navigator.clipboard.writeText(result.clipboardText ?? result.prompt);
        toastManager.add({
          title: t("toasts.promptCopiedFallback.title"),
          description: t("toasts.promptCopiedFallback.description"),
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
        title: t("toasts.started.title"),
        description: t("toasts.started.description"),
        type: "success",
      });
    } catch (error) {
      handleError(error, t("toasts.startFailed.title"));
    } finally {
      setIsLaunching(false);
    }
  }, [agent, handleError, rememberAgent, runConfig, runner, source, t]);

  return {
    copyPrompt,
    isCopying,
    isLaunching,
    launchAgentFix,
  };
}
