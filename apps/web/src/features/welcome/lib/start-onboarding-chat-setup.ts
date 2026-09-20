import type { useTranslations } from "next-intl";
import { toastManager } from "@workspace/ui";
import { enableChatForOnboardingAgents } from "@/features/agent/lib/enable-chat-for-onboarding-agents";

type OnboardingT = ReturnType<typeof useTranslations>;

let setupGeneration = 0;

/**
 * Enable Agent Chat providers in the background. Onboarding continue must not
 * await this — persist prefs, then fire this and move to the next step.
 *
 * Loading toast is indeterminate on purpose: the last step used to report
 * "2 of 2" with a full bar while ACP/npm work was still running.
 */
export async function startOnboardingChatSetup(options: {
  selectedTerminalIds: Iterable<string>;
  enableDeepSeek: boolean;
  t: OnboardingT;
}): Promise<void> {
  const { t } = options;
  const generation = ++setupGeneration;
  const isCurrent = () => generation === setupGeneration;

  const toastId = toastManager.add({
    title: t("agents.provisioning"),
    type: "loading",
    timeout: 0,
  });

  try {
    const { acpFailed, deepseekFailed } = await enableChatForOnboardingAgents({
      selectedTerminalIds: options.selectedTerminalIds,
      enableDeepSeek: options.enableDeepSeek,
    });

    if (!isCurrent()) return;

    const failedNames = [...acpFailed];
    if (deepseekFailed) failedNames.push("DeepSeek Harness");
    if (failedNames.length > 0) {
      toastManager.update(toastId, {
        title: t("agents.provisionFailedTitle"),
        description: t("agents.provisionFailed", {
          names: failedNames.join(", "),
        }),
        type: "error",
        timeout: 8000,
        data: {},
      });
      return;
    }

    toastManager.update(toastId, {
      title: t("agents.provisionReadyTitle"),
      description: t("agents.provisionReady"),
      type: "success",
      timeout: 3500,
      data: {},
    });
  } catch (err) {
    console.error("Failed to enable Agent Chat providers:", err);
    if (!isCurrent()) return;
    toastManager.update(toastId, {
      title: t("agents.provisionFailedTitle"),
      description: t("agents.provisionFailedGeneric"),
      type: "error",
      timeout: 8000,
      data: {},
    });
  }
}
