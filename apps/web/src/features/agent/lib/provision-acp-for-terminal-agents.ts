import { agentApi } from "@/api/ws-api";
import { acpProvisionTargets } from "./acp-provision-targets";

export { acpProvisionTargets } from "./acp-provision-targets";

export async function provisionAcpForTerminalAgents(
  selectedTerminalIds: Iterable<string>,
): Promise<{ failed: string[] }> {
  const { agents } = await agentApi.listRegistry();
  const targets = acpProvisionTargets(agents, selectedTerminalIds);
  const results = await Promise.allSettled(
    targets.map(async (agent) => {
      const result = await agentApi.installRegistry(agent.id);
      if (result.needs_confirmation) {
        return;
      }
      if (!result.installed) {
        throw new Error(result.message || "install failed");
      }
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
