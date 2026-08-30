export type AcpProvisionCandidate = {
  id: string;
  name: string;
  installed: boolean;
  provision_kind?: "native" | "adapter";
  terminal_agent_id?: string | null;
};

/**
 * ACP registry agents that should be provisioned for selected terminal agents.
 *
 * Native agents (official CLI + ACP args) are bound only when the CLI is
 * already on PATH. Adapter agents are downloaded when missing.
 */
export function acpProvisionTargets<T extends AcpProvisionCandidate>(
  agents: T[],
  selectedTerminalIds: Iterable<string>,
): T[] {
  const selected = new Set(selectedTerminalIds);
  return agents.filter((agent) => {
    if (!agent.terminal_agent_id || !selected.has(agent.terminal_agent_id)) {
      return false;
    }
    if (agent.provision_kind === "native") {
      return Boolean(agent.installed);
    }
    return !agent.installed;
  });
}
