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
 * Native agents (official CLI + ACP args): bind only when the CLI is already on
 * PATH. Never download a package that would overwrite an ACP-capable CLI.
 * Adapter agents: download when missing.
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
      // Skip download when CLI already supports ACP (installed=true from PATH).
      return Boolean(agent.installed);
    }
    return !agent.installed;
  });
}

/**
 * Onboarding Chat setup only binds native ACP CLIs already on PATH.
 * Missing adapter packages (`npm install -g`) can take minutes and belong in
 * Agents settings, not the first-run continue path.
 */
export function acpOnboardingProvisionTargets<T extends AcpProvisionCandidate>(
  agents: T[],
  selectedTerminalIds: Iterable<string>,
): T[] {
  return acpProvisionTargets(agents, selectedTerminalIds).filter(
    (agent) => agent.provision_kind === "native",
  );
}
