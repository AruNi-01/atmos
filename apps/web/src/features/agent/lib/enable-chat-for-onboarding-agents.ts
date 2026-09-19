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
 * 2. Bind native ACP CLIs already on PATH (no adapter npm downloads)
 * 3. Optional DeepSeek Harness custom switch; npx preload runs in the background
 *
 * Skip-download for official ACP-capable CLIs stays in
 * `acpOnboardingProvisionTargets` / backend `install_registry_agent`.
 */
export async function enableChatForOnboardingAgents(options: {
  selectedTerminalIds: Iterable<string>;
  enableDeepSeek?: boolean;
  onProgress?: (progress: OnboardingChatSetupProgress) => void;
}): Promise<EnableChatForOnboardingResult> {
  const includeDeepSeek = Boolean(options.enableDeepSeek);
  let current = 0;
  const report = (step: OnboardingChatSetupStep, total: number) => {
    current += 1;
    options.onProgress?.({ step, current, total });
  };

  const wantedNativeHosts = nativeChatHostsForTerminalSelection(
    options.selectedTerminalIds,
  );
  const listedNatives = await agentApi.listNativeChatAgents().catch(() => ({
    agents: [] as Array<{ id: string; cli_present: boolean }>,
  }));
  const nativeHostsWithCli = wantedNativeHosts.filter((id) =>
    listedNatives.agents.some((agent) => agent.id === id && agent.cli_present),
  );
  const remainingAcpIds = acpOnboardingTerminalIds(
    options.selectedTerminalIds,
    nativeHostsWithCli,
  );
  const total =
    1 + (remainingAcpIds.length > 0 ? 1 : 0) + (includeDeepSeek ? 1 : 0);

  report("native", total);
  const nativeResults = await Promise.allSettled(
    nativeHostsWithCli.map((id) => agentApi.setNativeChatAgentEnabled(id, true)),
  );
  const nativeFailed = nativeHostsWithCli.filter(
    (_, index) => nativeResults[index]?.status === "rejected",
  );
  const enabledNativeHosts = nativeHostsWithCli.filter((id) => !nativeFailed.includes(id));

  const acpIds = acpOnboardingTerminalIds(
    options.selectedTerminalIds,
    enabledNativeHosts,
  );
  let acpFailed: string[] = [];
  if (acpIds.length > 0) {
    report("acp", total);
    const provisioned = await provisionAcpForTerminalAgents(acpIds);
    acpFailed = provisioned.failed;
  }

  let deepseekFailed = false;
  if (includeDeepSeek) {
    report("deepseek", total);
    try {
      await agentApi.setCustomAgentEnabled(DEEPSEEK_HARNESS_ID, true);
      // Warm npx without blocking the onboarding toast; first Chat use is slow
      // if this never runs.
      void agentApi.preloadCustomAgent(DEEPSEEK_HARNESS_ID).catch(() => {});
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
