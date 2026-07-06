import tuiFollowUpManifest from "@atmos/resources/terminal-agents/tui_follow_up_agents.json";

export interface TerminalAgentTuiFollowUpDefinition {
  agentId: string;
  /** Regex tested against the accumulated terminal output buffer. */
  readyPattern: string;
  readyPatternFlags?: string;
}

interface TerminalAgentTuiFollowUpManifest {
  quietMs?: number;
  timeoutMs?: number;
  outputBufferLimit?: number;
  agents: TerminalAgentTuiFollowUpDefinition[];
}

type CompiledTerminalAgentTuiFollowUp = TerminalAgentTuiFollowUpDefinition & {
  readyRegex: RegExp;
};

function compileTuiFollowUpAgents(
  agents: TerminalAgentTuiFollowUpDefinition[],
): Map<string, CompiledTerminalAgentTuiFollowUp> {
  const compiled = new Map<string, CompiledTerminalAgentTuiFollowUp>();
  for (const agent of agents) {
    const agentId = agent.agentId.trim();
    if (!agentId) {
      throw new Error("Terminal agent TUI follow-up config requires a non-empty agentId.");
    }
    if (compiled.has(agentId)) {
      throw new Error(`Duplicate terminal agent TUI follow-up config for agentId: ${agentId}`);
    }
    const readyPattern = agent.readyPattern?.trim();
    if (!readyPattern) {
      throw new Error(`Terminal agent TUI follow-up config for ${agentId} requires readyPattern.`);
    }
    let readyRegex: RegExp;
    try {
      readyRegex = new RegExp(readyPattern, agent.readyPatternFlags ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid readyPattern for terminal agent TUI follow-up config (${agentId}): ${message}`,
      );
    }
    compiled.set(agentId, {
      ...agent,
      agentId,
      readyPattern,
      readyRegex,
    });
  }
  return compiled;
}

const manifest = tuiFollowUpManifest as TerminalAgentTuiFollowUpManifest;
const TUI_FOLLOW_UP_AGENTS = compileTuiFollowUpAgents(manifest.agents ?? []);

export const TUI_FOLLOW_UP_QUIET_MS = manifest.quietMs ?? 250;
export const TUI_FOLLOW_UP_TIMEOUT_MS = manifest.timeoutMs ?? 25_000;
const TUI_OUTPUT_BUFFER_LIMIT = manifest.outputBufferLimit ?? 4096;

export function getTerminalAgentTuiFollowUpConfig(
  agentId: string,
): TerminalAgentTuiFollowUpDefinition | undefined {
  const config = TUI_FOLLOW_UP_AGENTS.get(agentId);
  if (!config) {
    return undefined;
  }
  return {
    agentId: config.agentId,
    readyPattern: config.readyPattern,
    readyPatternFlags: config.readyPatternFlags,
  };
}

export function listTerminalAgentTuiFollowUpAgentIds(): string[] {
  return [...TUI_FOLLOW_UP_AGENTS.keys()];
}

export function agentNeedsTuiFollowUp(agentId: string, prompt: string): boolean {
  return TUI_FOLLOW_UP_AGENTS.has(agentId) && prompt.trim().length > 0;
}

export function isAgentTuiReady(agentId: string, output: string): boolean {
  const config = TUI_FOLLOW_UP_AGENTS.get(agentId);
  if (!config) {
    return false;
  }
  return config.readyRegex.test(output);
}

export function appendTuiOutputBuffer(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= TUI_OUTPUT_BUFFER_LIMIT) {
    return next;
  }
  return next.slice(-TUI_OUTPUT_BUFFER_LIMIT);
}
