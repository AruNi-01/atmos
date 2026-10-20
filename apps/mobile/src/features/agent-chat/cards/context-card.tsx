import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { GaugeIcon } from "@/ui/icons/lucide-native";
import { contextBarTone, formatCompactTokenCount, type ContextUsageStats } from "../composer-cards";
import { copy, fillTemplate } from "../copy";
import { CARD_BODY, CARD_GAP, CardHeader } from "./expanded-card";

export function ContextCard({ stats }: { stats: ContextUsageStats }) {
  const theme = useMobileTheme();
  const percent = `${Math.round(stats.percent)}%`;
  const used = formatCompactTokenCount(stats.used);
  const size = formatCompactTokenCount(stats.context_window);
  const tone = contextBarTone(stats.percent);
  const clamped = Math.min(100, Math.max(0, stats.percent));
  const body = { color: theme.colors.secondaryLabel, ...CARD_BODY };
  return (
    <View style={{ gap: CARD_GAP }}>
      <CardHeader count={percent} icon={GaugeIcon} title={copy.contextWindowTitle} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={body}>{fillTemplate(copy.contextPercentFull, { percent })}</Text>
        <Text style={body}>{fillTemplate(copy.contextTokensSummary, { used, size })}</Text>
      </View>
      <View
        style={{
          backgroundColor: theme.colors.cardSubtle,
          borderRadius: 999,
          height: 6,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            backgroundColor: tone === "warning" ? theme.colors.yellow : theme.colors.label,
            height: "100%",
            width: `${clamped}%`,
          }}
        />
      </View>
    </View>
  );
}
