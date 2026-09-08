import { agentApi } from "@/api/ws-api";
import {
  DEEPSEEK_HARNESS_ID,
  acpOnboardingTerminalIds,
  nativeChatHostsForTerminalSelection,
  type NativeChatHostId,
} from "./custom-agent-registry";
import { provisionAcpForTerminalAgents } from "./provision-acp-for-terminal-agents";

export { acpOnboardingTerminalIds, nativeChatHostsForTerminalSelection } from "./custom-agent-registry";

export type EnableChatForOnboardingResult = {
  enabledNativeHosts: NativeChatHostId[];
  acpFailed: string[];
  deepseekFailed: boolean;
};

export type OnboardingChatSetupStep = "native" | "acp" | "deepseek";

export type OnboardingChatSetupProgress = {
  step: OnboardingChatSetupStep;
  current: number;
  total: number;
};

/**
 * Onboarding → Chat enable pipeline:
 * 1. Native Chat hosts for selected terminal families (switch on)
 * 2. ACP registry bind/download via existing provision guards
 * 3. Optional DeepSeek Harness custom switch (+ preload)
 *
 * Skip-download for official ACP-capable CLIs stays in
 * `acpProvisionTargets` / backend `install_registry_agent`.
 */
export async function enableChatForOnboardingAgents(options: {
  selectedTerminalIds: Iterable<string>;
  enableDeepSeek?: boolean;
  onProgress?: (progress: OnboardingChatSetupProgress) => void;
}): Promise<EnableChatForOnboardingResult> {
  const includeDeepSeek = Boolean(options.enableDeepSeek);
  const total = includeDeepSeek ? 3 : 2;
  const report = (step: OnboardingChatSetupStep, current: number) => {
    options.onProgress?.({ step, current, total });
  };

  report("native", 1);
  const wantedNativeHosts = nativeChatHostsForTerminalSelection(
    options.selectedTerminalIds,
  );
  const listedNatives = await agentApi.listNativeChatAgents().catch(() => ({
    agents: [] as Array<{ id: string; cli_present: boolean }>,
  }));
  const nativeHostsWithCli = wantedNativeHosts.filter((id) =>
    listedNatives.agents.some((agent) => agent.id === id && agent.cli_present),
  );

  const nativeResults = await Promise.allSettled(
    nativeHostsWithCli.map((id) => agentApi.setNativeChatAgentEnabled(id, true)),
  );
  const nativeFailed = nativeHostsWithCli.filter(
    (_, index) => nativeResults[index]?.status === "rejected",
  );
  const enabledNativeHosts = nativeHostsWithCli.filter((id) => !nativeFailed.includes(id));

  report("acp", 2);
  const { failed: acpFailed } = await provisionAcpForTerminalAgents(
    acpOnboardingTerminalIds(options.selectedTerminalIds, enabledNativeHosts),
  );

  let deepseekFailed = false;
  if (includeDeepSeek) {
    report("deepseek", 3);
    try {
      await agentApi.setCustomAgentEnabled(DEEPSEEK_HARNESS_ID, true);
      try {
        await agentApi.preloadCustomAgent(DEEPSEEK_HARNESS_ID);
      } catch {
        // Preload is best-effort (npx warm); Chat enable already succeeded.
      }
    } catch {
      deepseekFailed = true;
    }
  }

  return {
    enabledNativeHosts,
    acpFailed: [...acpFailed, ...nativeFailed],
    deepseekFailed,
  };
}
