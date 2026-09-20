import type { AutomationChatAgentConfig } from "@/features/automations/types";

export const AUTOMATION_CHAT_PERMISSION_MODE = "yolo";

export function automationChatAgentConfig(
  providerId: string,
  extras?: {
    model?: string | null;
    thinking?: string | null;
    fast?: string | null;
    context?: string | null;
  },
): AutomationChatAgentConfig {
  const model = extras?.model?.trim() || null;
  const thinking = extras?.thinking?.trim() || null;
  const fast = extras?.fast?.trim() || null;
  const context = extras?.context?.trim() || null;
  return {
    kind: "chat",
    provider_id: providerId,
    permission_mode: AUTOMATION_CHAT_PERMISSION_MODE,
    ...(model ? { model } : {}),
    ...(thinking ? { thinking } : {}),
    ...(fast ? { fast } : {}),
    ...(context ? { context } : {}),
  };
}
