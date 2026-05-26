import terminalAgents from "@atmos/resources/terminal-agents/builtin_agents.json";

export interface TerminalAgentDefinition {
  id: string;
  label: string;
  cmd: string;
  params: string;
  useEcho?: boolean;
}

export const TERMINAL_AGENT_DEFINITIONS =
  terminalAgents as readonly TerminalAgentDefinition[];
