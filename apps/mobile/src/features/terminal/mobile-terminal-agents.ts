import terminalAgents from "@atmos/resources/terminal-agents/builtin_agents.json";
import type { TerminalTitleAgent } from "@atmos/shared/terminal";

type TerminalAgentManifestEntry = {
  id: string;
  label: string;
  cmd: string;
  useEcho?: boolean;
};

export type MobileTerminalAgent = TerminalTitleAgent & {
  iconType: "built-in" | "custom";
};

export const MOBILE_TERMINAL_AGENTS: MobileTerminalAgent[] = (terminalAgents as TerminalAgentManifestEntry[]).map(
  (agent) => ({
    command: agent.cmd,
    iconType: "built-in",
    id: agent.id,
    label: agent.label,
    pipeCommand: agent.useEcho ? agent.cmd : undefined,
  }),
);
