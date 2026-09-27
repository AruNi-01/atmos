import type { AgentOptionsSnapshot, AgentThinkingSupport } from "@atmos/api-types/ws/dto/agent-chat";

export type ComposerControlId = "agent" | "model" | "thinking" | "mode" | "permission";

export type ComposerControl = { id: ComposerControlId };

export function hasSelectableThinking(
  thinking: AgentThinkingSupport | null | undefined,
): boolean {
  if (!thinking) return false;
  switch (thinking.type) {
    case "none":
    case "encoded_in_model":
      return false;
    case "enum":
      return thinking.options.some((option) => option.trim().length > 0);
    case "manual":
    case "flag_only":
      return true;
    default:
      return false;
  }
}

const THINKING_LEVEL_LABELS: Record<string, string> = {
  off: "Off",
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  extra_high: "Extra high",
  max: "Max",
  ultra: "Ultra",
  maximum: "Maximum",
};

export function thinkingLevelLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return THINKING_LEVEL_LABELS[trimmed.toLowerCase()] ?? trimmed;
}

/** Web shows one chip: `grok-4.6 · Extra high`. */
export function modelThinkingChip(modelLabel: string, thinkingLabel: string): string {
  const model = modelLabel.trim();
  const thinking = thinkingLabel.trim();
  if (model && thinking) return `${model} · ${thinking}`;
  return model || thinking;
}

export function composerControls(snapshot: AgentOptionsSnapshot | null): ComposerControl[] {
  const controls: ComposerControl[] = [{ id: "agent" }];
  if (!snapshot) return controls;
  if (snapshot.models.length > 0) controls.push({ id: "model" });
  if (hasSelectableThinking(snapshot.thinking)) controls.push({ id: "thinking" });
  if (snapshot.modes.length > 0) controls.push({ id: "mode" });
  if ((snapshot.permission_modes?.length ?? 0) > 0) controls.push({ id: "permission" });
  return controls;
}
