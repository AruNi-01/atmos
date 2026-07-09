import type { TerminalRef } from "@/features/terminal/components/Terminal";
import { startAgentTuiFollowUp } from "@/features/terminal/lib/terminal-agent-tui-follow-up-runner";
import {
  ctrlEnterInput,
  resolveTerminalAgentSubmitMode,
  wrapBracketedPaste,
} from "@/features/terminal/lib/terminal-runtime-utils";
import type { TerminalPaneAgent } from "@/features/terminal/types";

const TUI_FOLLOW_UP_SUBMIT_DELAY_MS = 80;

export type PendingTerminalRun = {
  launch: string;
  /** When false, type launch text without executing it. Defaults to true. */
  execute?: boolean;
  tuiFollowUp?: {
    agentId: string;
    prompt: string;
  };
};

export function toPendingTerminalRun(
  launchCommand: string,
  options?: {
    agentId?: string;
    tuiFollowUpPrompt?: string;
  },
): PendingTerminalRun {
  const launch = launchCommand.trim();
  const prompt = options?.tuiFollowUpPrompt?.trim();
  if (!prompt || !options?.agentId) {
    return { launch };
  }
  return {
    launch,
    tuiFollowUp: {
      agentId: options.agentId,
      prompt,
    },
  };
}

export function sendTuiFollowUpPrompt(
  terminalRef: TerminalRef,
  prompt: string,
  options?: { agentId?: string },
) {
  const trimmed = prompt.trim();
  if (!trimmed) return;

  const agent: TerminalPaneAgent | undefined = options?.agentId
    ? {
        id: options.agentId,
        label: options.agentId,
        command: options.agentId,
        iconType: "built-in",
      }
    : undefined;
  const submitMode = resolveTerminalAgentSubmitMode(agent);
  const normalized = trimmed.replace(/\r?\n/g, "\r");
  const hasMultiline = normalized.includes("\r");

  const submitPrompt = () => {
    if (submitMode === "text-ctrl-enter") {
      terminalRef.sendText(ctrlEnterInput());
      return;
    }
    terminalRef.sendEnter();
  };

  if (submitMode === "bracketed-paste-enter" || hasMultiline) {
    terminalRef.sendText(wrapBracketedPaste(normalized));
    setTimeout(submitPrompt, TUI_FOLLOW_UP_SUBMIT_DELAY_MS);
    return;
  }

  if (submitMode === "text-ctrl-enter") {
    terminalRef.sendText(normalized);
    setTimeout(submitPrompt, TUI_FOLLOW_UP_SUBMIT_DELAY_MS);
    return;
  }

  // Default interactive agents (e.g. Hermes): fill and submit in one write.
  terminalRef.sendText(`${normalized}\r`);
}

export function deliverTerminalAgentLaunch(
  terminalRef: TerminalRef,
  launch: string,
  execute = true,
  onSubmitted?: () => void,
): (options?: { abortUnsubmitted?: boolean }) => void {
  const trimmed = launch.trimEnd();
  if (!trimmed) return () => {};

  const hasMultiline = /[\r\n]/.test(trimmed);
  if (!hasMultiline) {
    terminalRef.sendText(execute ? `${trimmed}\r` : trimmed);
    if (execute) onSubmitted?.();
    return () => {};
  }

  // Multiline shell launches (e.g. Agent Fix prompts with diff hunks) must use
  // bracketed paste so embedded newlines are not treated as Enter by the shell.
  terminalRef.sendText(wrapBracketedPaste(trimmed));
  if (!execute) return () => {};

  let submitted = false;
  const submit = () => {
    if (submitted) return;
    submitted = true;
    terminalRef.sendEnter();
    onSubmitted?.();
  };
  const timer = setTimeout(submit, TUI_FOLLOW_UP_SUBMIT_DELAY_MS);
  return (options) => {
    clearTimeout(timer);
    if (submitted) return;
    if (options?.abortUnsubmitted) {
      // A newer run is replacing this paste — discard the orphaned edit buffer.
      terminalRef.sendText("\x03");
      return;
    }
    // Passive cleanup (hook remount / tab teardown): still submit so the paste is
    // not stranded without Enter after the timer is cleared.
    submit();
  };
}

export function deliverPendingTerminalRun(
  terminalRef: TerminalRef,
  run: PendingTerminalRun,
): (options?: { abortUnsubmitted?: boolean }) => void {
  let clearFollowUp = () => {};
  const clearLaunch = deliverTerminalAgentLaunch(
    terminalRef,
    run.launch,
    run.execute !== false,
    run.tuiFollowUp
      ? () => {
          clearFollowUp = startAgentTuiFollowUp(
            terminalRef,
            run.tuiFollowUp!.agentId,
            run.tuiFollowUp!.prompt,
          );
        }
      : undefined,
  );
  return (options) => {
    clearLaunch(options);
    clearFollowUp();
  };
}
