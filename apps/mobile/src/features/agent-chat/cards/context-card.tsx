import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { chatForeground, chatMutedForeground } from "../chat-ink";
import type { ContextUsageStats } from "../composer-cards";
import { copy, fillTemplate } from "../copy";
import {
  contextBarTrack,
  contextBarWarning,
  contextWindowBarTone,
  formatCompactTokenCount,
} from "../context-window";
import {
  SUBAGENT_PANEL_PAD,
  SUBAGENT_PANEL_RADIUS,
  subagentPanelBorder,
} from "../inline-subagent-tasks";

export function ContextCard({ stats }: { stats: ContextUsageStats }) {
  const theme = useMobileTheme();
  const foreground = chatForeground(theme.isDark);
  const muted = chatMutedForeground(theme.isDark);
  const percentLabel = `${Math.round(stats.percent)}%`;
  const tone = contextWindowBarTone(stats.percent);
  const fill = tone === "warning" ? contextBarWarning(theme.isDark) : foreground;
  const width = `${Math.min(100, Math.max(0, stats.percent))}%` as `${number}%`;
  return (
    <View
      accessibilityLabel={copy.contextWindowTitle}
      style={{
        backgroundColor: theme.colors.background,
        borderColor: subagentPanelBorder(theme.isDark),
        borderRadius: SUBAGENT_PANEL_RADIUS,
        borderWidth: 1,
        padding: SUBAGENT_PANEL_PAD,
        width: "100%",
      }}
    >
      <Text
        style={{
          color: foreground,
          fontSize: 14,
          fontWeight: "500",
          lineHeight: 20,
          marginBottom: 8,
        }}
      >
        {copy.contextWindowTitle}
      </Text>
      <View style={{ gap: 12 }}>
        <View style={{ alignItems: "baseline", flexDirection: "row", gap: 12 }}>
          <Text
            style={{
              color: muted,
              fontSize: 12,
              fontVariant: ["tabular-nums"],
              lineHeight: 16,
            }}
          >
            {fillTemplate(copy.contextWindowPercentFull, { percent: percentLabel })}
          </Text>
          <Text
            style={{
              color: muted,
              fontSize: 12,
              fontVariant: ["tabular-nums"],
              lineHeight: 16,
              marginLeft: "auto",
            }}
          >
            {fillTemplate(copy.contextWindowTokensSummary, {
              used: formatCompactTokenCount(stats.used),
              size: formatCompactTokenCount(stats.context_window),
            })}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: contextBarTrack(theme.isDark),
            borderRadius: 999,
            height: 6,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <View style={{ backgroundColor: fill, borderRadius: 999, height: 6, width }} />
        </View>
      </View>
    </View>
  );
}
