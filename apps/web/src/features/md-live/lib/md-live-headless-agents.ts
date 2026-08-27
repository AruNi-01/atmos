import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";

/** Built-in agents with a prompt strategy can run APP-024 headless CLI. */
export function agentSupportsHeadless(agentId: string): boolean {
  return TERMINAL_AGENT_DEFINITIONS.some((agent) => agent.id === agentId);
}

export function filterHeadlessAgents<T extends { id: string }>(agents: readonly T[]): T[] {
  return agents.filter((agent) => agentSupportsHeadless(agent.id));
}
