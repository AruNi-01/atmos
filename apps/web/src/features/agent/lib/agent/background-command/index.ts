import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { resolveAgentVendor, type AgentVendor } from "@/features/agent/lib/agent/agent-vendor";
import { claudeBackgroundAdapter } from "./adapters/claude";
import { fallbackBackgroundAdapter } from "./adapters/fallback";
import { grokBackgroundAdapter } from "./adapters/grok";
import type { BackgroundCommand, BackgroundCommandAdapter, BackgroundToolProbe } from "./types";

export type { BackgroundCommand, BackgroundToolProbe } from "./types";

const adaptersByVendor: Record<AgentVendor, BackgroundCommandAdapter[]> = {
  grok: [grokBackgroundAdapter, fallbackBackgroundAdapter],
  claude: [claudeBackgroundAdapter, fallbackBackgroundAdapter],
  opencode: [fallbackBackgroundAdapter],
  cursor: [fallbackBackgroundAdapter],
  gemini: [fallbackBackgroundAdapter],
  antigravity: [fallbackBackgroundAdapter],
  "factory-droid": [fallbackBackgroundAdapter],
  kiro: [fallbackBackgroundAdapter],
  unknown: [grokBackgroundAdapter, claudeBackgroundAdapter, fallbackBackgroundAdapter],
};

function adaptersFor(registryId?: string | null): BackgroundCommandAdapter[] {
  return adaptersByVendor[resolveAgentVendor(registryId ?? "")];
}

export function detectBackgroundCommand(
  probe: BackgroundToolProbe,
  registryId?: string | null,
): BackgroundCommand | null {
  for (const adapter of adaptersFor(registryId)) {
    const detected = adapter.detect(probe);
    if (detected) return detected;
  }
  return null;
}

export function isBackgroundToolCall(
  probe: BackgroundToolProbe,
  registryId?: string | null,
): boolean {
  return detectBackgroundCommand(probe, registryId) != null;
}

export function isLiveBackgroundToolCall(
  probe: BackgroundToolProbe,
  registryId?: string | null,
): boolean {
  return detectBackgroundCommand(probe, registryId)?.running === true;
}

export function isBackgroundPollTool(
  probe: BackgroundToolProbe,
  registryId?: string | null,
): boolean {
  return adaptersFor(registryId).some((adapter) => adapter.isPoll(probe));
}

export function applyBackgroundPollTool(
  messages: AgentMessage[],
  probe: BackgroundToolProbe,
  registryId?: string | null,
): AgentMessage[] {
  for (const adapter of adaptersFor(registryId)) {
    if (!adapter.isPoll(probe) || !adapter.applyPoll) continue;
    return adapter.applyPoll(messages, probe);
  }
  return messages;
}

export function displayBackgroundCommand(
  probe: BackgroundToolProbe,
  registryId?: string | null,
): string {
  const detected = detectBackgroundCommand(probe, registryId);
  const command = detected?.command || "";
  return command.replace(/^\[bg\]\s*/i, "").trim() || command;
}
