import type { AgentVendor } from "@/lib/agent/agent-vendor";
import { resolveAgentVendor } from "@/lib/agent/agent-vendor";
import { claudeCodeSubAgentAdapter } from "./adapters/claude-code";
import { fallbackSubAgentAdapter } from "./adapters/fallback";
import { opencodeSubAgentAdapter } from "./adapters/opencode";
import type { AtmosSubAgentMessage, SubAgentToolCallBlock } from "./types";
import { looksLikeSubAgent } from "./utils";

const adaptersByVendor: Record<AgentVendor, typeof claudeCodeSubAgentAdapter[]> = {
  claude: [claudeCodeSubAgentAdapter, fallbackSubAgentAdapter],
  opencode: [opencodeSubAgentAdapter, fallbackSubAgentAdapter],
  unknown: [fallbackSubAgentAdapter],
};

export type { AtmosSubAgentMessage, SubAgentToolCallBlock } from "./types";

export function normalizeSubAgent(
  block: SubAgentToolCallBlock,
  registryId: string,
): AtmosSubAgentMessage | null {
  if (!looksLikeSubAgent(block)) return null;
  const vendor = resolveAgentVendor(registryId);
  const adapters = adaptersByVendor[vendor];

  for (const adapter of adapters) {
    if (!adapter.canHandle(block, vendor)) continue;
    const result = adapter.normalize(block, vendor);
    if (result) return result;
  }

  return null;
}
