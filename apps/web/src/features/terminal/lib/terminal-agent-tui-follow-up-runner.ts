import {
  appendTuiOutputBuffer,
  isAgentTuiReady,
  TUI_FOLLOW_UP_QUIET_MS,
  TUI_FOLLOW_UP_TIMEOUT_MS,
} from "@/features/agent/lib/terminal-agent-tui-follow-up";
import type { TerminalRef } from "@/features/terminal/components/Terminal";
import { sendTuiFollowUpPrompt } from "@/features/terminal/lib/terminal-agent-run-delivery";

type ActiveTuiFollowUp = {
  agentId: string;
  prompt: string;
  buffer: string;
  quietTimer: ReturnType<typeof setTimeout> | null;
  timeoutTimer: ReturnType<typeof setTimeout>;
  unsubscribe: (() => void) | null;
  submitCleanup: (() => void) | null;
  completed: boolean;
};

export function startAgentTuiFollowUp(
  terminalRef: TerminalRef,
  agentId: string,
  prompt: string,
): () => void {
  let active: ActiveTuiFollowUp | null = {
    agentId,
    prompt,
    buffer: "",
    quietTimer: null,
    timeoutTimer: setTimeout(() => {
      complete();
    }, TUI_FOLLOW_UP_TIMEOUT_MS),
    unsubscribe: null,
    submitCleanup: null,
    completed: false,
  };

  const clear = () => {
    if (!active) return;
    if (active.quietTimer) {
      clearTimeout(active.quietTimer);
    }
    clearTimeout(active.timeoutTimer);
    active.unsubscribe?.();
    active.submitCleanup?.();
    active = null;
  };

  const complete = () => {
    if (!active || active.completed) return;
    active.completed = true;
    const pendingPrompt = active.prompt;
    const pendingAgentId = active.agentId;
    const submitCleanup = sendTuiFollowUpPrompt(terminalRef, pendingPrompt, { agentId: pendingAgentId });
    active.submitCleanup = submitCleanup ?? null;
    // Clear timers and unsubscribe, but keep active state with submitCleanup for the final cleanup
    if (active.quietTimer) {
      clearTimeout(active.quietTimer);
    }
    clearTimeout(active.timeoutTimer);
    active.unsubscribe?.();
    active.quietTimer = null;
    active.unsubscribe = null;
  };

  const scheduleQuietReady = () => {
    if (!active) return;
    if (active.quietTimer) {
      clearTimeout(active.quietTimer);
    }
    active.quietTimer = setTimeout(() => {
      if (!active) return;
      active.quietTimer = null;
      complete();
    }, TUI_FOLLOW_UP_QUIET_MS);
  };

  if (!terminalRef.subscribeOutput) {
    complete();
    return () => {};
  }

  active.unsubscribe = terminalRef.subscribeOutput((chunk) => {
    if (!active) return;
    active.buffer = appendTuiOutputBuffer(active.buffer, chunk);
    if (!isAgentTuiReady(active.agentId, active.buffer)) {
      return;
    }
    scheduleQuietReady();
  });

  return clear;
}
