import { agentApi } from "@/api/ws-api";
import {
  DEEPSEEK_HARNESS_ID,
  nativeChatHostsForTerminalSelection,
  type NativeChatHostId,
} from "./custom-agent-registry";
import { provisionAcpForTerminalAgents } from "./provision-acp-for-terminal-agents";

export { nativeChatHostsForTerminalSelection } from "./custom-agent-registry";

export type EnableChatForOnboardingResult = {
  enabledNativeHosts: NativeChatHostId[];
  acpFailed: string[];
  deepseekFailed: boolean;
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
}): Promise<EnableChatForOnboardingResult> {
  const enabledNativeHosts = nativeChatHostsForTerminalSelection(
    options.selectedTerminalIds,
  );

  const nativeResults = await Promise.allSettled(
    enabledNativeHosts.map((id) => agentApi.setNativeChatAgentEnabled(id, true)),
  );
  const nativeFailed = enabledNativeHosts.filter(
    (_, index) => nativeResults[index]?.status === "rejected",
  );

  const { failed: acpFailed } = await provisionAcpForTerminalAgents(
    options.selectedTerminalIds,
  );

  let deepseekFailed = false;
  if (options.enableDeepSeek) {
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
    enabledNativeHosts: enabledNativeHosts.filter((id) => !nativeFailed.includes(id)),
    acpFailed: [...acpFailed, ...nativeFailed],
    deepseekFailed,
  };
}
