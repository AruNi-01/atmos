import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { resolveTokenUsageModelIcon } from "@/features/token-usage/model-icon";
import { useMobileTheme } from "@/theme/theme-store";
import { BrainCircuitIcon, CpuIcon } from "@/ui/icons/lucide-native";
import { ProviderGlyph } from "@/ui/icons/provider-glyph";

/**
 * Model-dimension mark. Share rows omit `color` so the glyph matches an Agent icon.
 * Chart legends pass the series color, same as web.
 */
export function UsageModelIcon({
  color,
  modelId,
  providerId,
  size = 16,
}: {
  color?: string;
  modelId: string;
  providerId?: string | null;
  size?: number;
}) {
  const theme = useMobileTheme();
  const resolved = resolveTokenUsageModelIcon(providerId, modelId);

  if (resolved.kind === "agent") {
    return <MobileAgentIcon agentId={resolved.agentId} size={size} tintColor={color} />;
  }

  const tint = color ?? (resolved.kind === "provider" ? theme.colors.label : theme.colors.secondaryLabel);
  if (resolved.kind === "provider") {
    return <ProviderGlyph color={tint} providerId={resolved.providerId} size={size} />;
  }
  if (resolved.kind === "other") {
    return <BrainCircuitIcon color={tint} size={size} />;
  }
  return <CpuIcon color={tint} size={size} />;
}
