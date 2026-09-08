import type { useTranslations } from "next-intl";
import { toastManager } from "@workspace/ui";
import {
  enableChatForOnboardingAgents,
  type OnboardingChatSetupProgress,
} from "@/features/agent/lib/enable-chat-for-onboarding-agents";

type OnboardingT = ReturnType<typeof useTranslations>;

let setupGeneration = 0;

function progressRatio(progress: OnboardingChatSetupProgress): number {
  if (progress.total <= 0) return 1;
  return Math.min(1, Math.max(0, progress.current / progress.total));
}

function applyLoadingToast(
  toastId: string,
  t: OnboardingT,
  progress: OnboardingChatSetupProgress,
) {
  toastManager.update(toastId, {
    title: t("agents.provisioning"),
    description: t("agents.provisioningProgress", {
      current: progress.current,
      total: progress.total,
    }),
    type: "loading",
    timeout: 0,
    data: { progress: progressRatio(progress) },
  });
}

/**
 * Enable Agent Chat providers in the background. Onboarding continue must not
 * await this — persist prefs, then fire this and move to the next step.
 */
export async function startOnboardingChatSetup(options: {
  selectedTerminalIds: Iterable<string>;
  enableDeepSeek: boolean;
  t: OnboardingT;
}): Promise<void> {
  const { t } = options;
  const generation = ++setupGeneration;
  const isCurrent = () => generation === setupGeneration;

  const total = options.enableDeepSeek ? 3 : 2;
  const toastId = toastManager.add({
    title: t("agents.provisioning"),
    description: t("agents.provisioningProgress", {
      current: 1,
      total,
    }),
    type: "loading",
    timeout: 0,
    data: { progress: 1 / total },
  });

  try {
    const { acpFailed, deepseekFailed } = await enableChatForOnboardingAgents({
      selectedTerminalIds: options.selectedTerminalIds,
      enableDeepSeek: options.enableDeepSeek,
      onProgress: (progress) => {
        if (!isCurrent()) return;
        applyLoadingToast(toastId, t, progress);
      },
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
