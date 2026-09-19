import { agentApi } from "@/api/ws-api";
import { acpOnboardingProvisionTargets } from "./acp-provision-targets";

export { acpOnboardingProvisionTargets, acpProvisionTargets } from "./acp-provision-targets";

export async function provisionAcpForTerminalAgents(
  selectedTerminalIds: Iterable<string>,
): Promise<{ failed: string[] }> {
  const selected = [...selectedTerminalIds];
  // Native Chat already covered these families — don't pay for `npm list -g`
  // inside agent_registry_list.
  if (selected.length === 0) {
    return { failed: [] };
  }

  const { agents } = await agentApi.listRegistry();
  const targets = acpOnboardingProvisionTargets(agents, selected);
  const results = await Promise.allSettled(
    targets.map(async (agent) => {
      const result = await agentApi.installRegistry(agent.id);
      if (result.needs_confirmation) {
        return;
      }
      if (!result.installed) {
        throw new Error(result.message || "install failed");
      }
      await agentApi.setRegistryAgentEnabled(agent.id, true);
    }),
  );

  const failed: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failed.push(targets[index]?.name || targets[index]?.id || "unknown");
    }
  });
  return { failed };
}
