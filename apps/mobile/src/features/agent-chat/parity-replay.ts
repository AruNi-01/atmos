import type { AgentChatEvent, AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { TREE_DRAW_MS } from "@atmos/agent-transcript/agent-tree-branch";
import { applyChatEvent, createChatTranscript } from "./fold-transcript";

export type ParityReplayStep = {
  atMs: number;
  event: AgentChatEvent;
};

/** Halfway through the draw, then when it finishes, while the row is still the latest event. */
export function parityReplayShotTimes(steps: readonly ParityReplayStep[]): number[] {
  const times = new Set<number>();
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step) continue;
    times.add(step.atMs);
    if (step.event.payload.type !== "tool_call_started") continue;
    const nextAt = steps[index + 1]?.atMs ?? Number.POSITIVE_INFINITY;
    for (const delta of [Math.round(TREE_DRAW_MS / 2), TREE_DRAW_MS]) {
      const at = step.atMs + delta;
      if (at < nextAt) times.add(at);
    }
  }
  return [...times].sort((left, right) => left - right);
}

/**
 * 0..1 stroke progress for the latest tool that has started.
 * Null before the first tool. A capture hold paints this fraction instead of
 * letting the 400ms draw finish before a slow screenshot returns.
 */
export function parityDrawHoldProgress(
  steps: readonly ParityReplayStep[],
  elapsedMs: number,
): number | null {
  let startedAt: number | null = null;
  for (const step of steps) {
    if (step.atMs > elapsedMs) break;
    if (step.event.payload.type === "tool_call_started") startedAt = step.atMs;
  }
  if (startedAt == null) return null;
  const age = elapsedMs - startedAt;
  if (age >= TREE_DRAW_MS) return 1;
  return age / TREE_DRAW_MS;
}

export function parityReplaySeed(messages: readonly AgentMessage[]): AgentMessage[] {
  return messages.filter((message) => message.role === "user");
}

/** User rows, then every script event whose time has arrived. */
export function foldParityReplay(
  chatId: string,
  seed: readonly AgentMessage[],
  steps: readonly ParityReplayStep[],
  elapsedMs: number,
): AgentMessage[] {
  let state = createChatTranscript(chatId, [...seed]);
  for (const step of steps) {
    if (step.atMs > elapsedMs) break;
    state = applyChatEvent(state, step.event).state;
  }
  return state.messages;
}
