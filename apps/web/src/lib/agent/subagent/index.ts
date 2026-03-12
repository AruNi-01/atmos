import type { AgentVendor } from "@/lib/agent/agent-vendor";
import { resolveAgentVendor } from "@/lib/agent/agent-vendor";
import { claudeCodeSubAgentAdapter } from "./adapters/claude-code";
import { cursorSubAgentAdapter } from "./adapters/cursor";
import { fallbackSubAgentAdapter } from "./adapters/fallback";
import { opencodeSubAgentAdapter } from "./adapters/opencode";
import type { AtmosSubAgentMessage, SubAgentToolCallBlock } from "./types";

const adaptersByVendor: Record<AgentVendor, typeof claudeCodeSubAgentAdapter[]> = {
  claude: [claudeCodeSubAgentAdapter, fallbackSubAgentAdapter],
  opencode: [opencodeSubAgentAdapter, fallbackSubAgentAdapter],
  cursor: [cursorSubAgentAdapter],
  unknown: [cursorSubAgentAdapter, fallbackSubAgentAdapter],
};

export type { AtmosSubAgentMessage, SubAgentToolCallBlock } from "./types";

export function normalizeSubAgent(
  block: SubAgentToolCallBlock,
  registryId: string,
  childToolCalls: SubAgentToolCallBlock[] = [],
): AtmosSubAgentMessage | null {
  const vendor = resolveAgentVendor(registryId);
  const adapters = adaptersByVendor[vendor];

  for (const adapter of adapters) {
    if (!adapter.canHandle(block, vendor)) continue;
    const result = adapter.normalize(block, vendor, childToolCalls);
    if (result) return result;
  }

  return null;
}
