import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import { wsActions } from "@/api/ws-actions";
import { AnimatedMetric } from "@/features/token-usage/animated-metric";
import { ChartAxisLabels, ScrollableChart, UsageGrowthChart, UsageHeatmap, UsageStackedChart } from "@/features/token-usage/charts";
import { formatCurrencyDetailed, formatMetric, formatPercent } from "@/features/token-usage/format";
import {
  buildHeatmap,
  chartColors,
  formatDay,
  formatUpdated,
  HEATMAP_DARK,
  HEATMAP_LIGHT,
  MIX_COLORS_DARK,
  MIX_COLORS_LIGHT,
  monthLabels,
  overviewShares,
  sortDays,
  stacked,
  timeline,
  tokenMix,
  yearList,
  type Resolution,
  type UsageDimension,
  type UsageMetric,
} from "@/features/token-usage/model";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { ShareSheet } from "@/features/token-usage/ShareSheet";
import { StatArt, type StatArtKind } from "@/features/token-usage/stat-art";
import { UsageScroll } from "@/features/usage/usage-scroll";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useMobileTheme } from "@/theme/theme-store";
import { BotIcon, BrainCircuitIcon, CoinsIcon, DollarSignIcon, ShareIcon } from "@/ui/icons/lucide-native";
import { ProviderGlyph } from "@/ui/icons/provider-glyph";
import { InlineError } from "@/ui/layout/app-screen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { MenuPicker } from "@/ui/primitives/menu-picker";
import { NativeSegmentedControl } from "@/ui/primitives/native-segmented-control";

const MIX_LABEL = { input: "Input", output: "Output", cacheRead: "Cache read", cacheWrite: "Cache write", reasoning: "Reasoning" } as const;

export function TokenUsageScreen() {
  const theme = useMobileTheme();
  const queryClient = useQueryClient();
  const { client, state } = useMobileWs();
  const wsUrl = useSessionStore((store) => store.activeClientSession?.ws_url ?? null);
  const connected = state === "open" && client != null;
  const queryKey = ["token-usage-overview", wsUrl] as const;
  const [metric, setMetric] = useState<UsageMetric>("tokens");
  const [dimension, setDimension] = useState<UsageDimension>("agent");
  const [resolution, setResolution] = useState<Resolution>("month");
  const [year, setYear] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const overviewQuery = useQuery({
    queryKey,
    enabled: connected,
    queryFn: () => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      return wsActions.tokenUsageOverview(client, { refresh: false, try_cookies: false });
    },
  });
  const refresh = useMutation({
    mutationFn: () => wsActions.tokenUsageOverview(client!, { refresh: true, try_cookies: false }),
    onSuccess: (overview) => queryClient.setQueryData(queryKey, overview),
  });
  const overview = overviewQuery.data ?? null;
  const days = useMemo(() => sortDays(overview?.by_day ?? []), [overview?.by_day]);
  const years = useMemo(() => yearList(overview?.available_years ?? [], days), [days, overview?.available_years]);
  const heatmapYear = year || years[years.length - 1] || "";
  const weeks = useMemo(() => buildHeatmap(days, heatmapYear, metric), [days, heatmapYear, metric]);
  const shares = useMemo(() => overviewShares(overview, metric, dimension), [dimension, metric, overview]);
  const colors = useMemo(() => chartColors(shares.map((row) => row.id), theme.isDark), [shares, theme.isDark]);
  const series = useMemo(() => timeline(days, resolution, metric), [days, metric, resolution]);
  const bars = useMemo(() => stacked(days, resolution, metric, dimension), [days, dimension, metric, resolution]);
  const barColors = useMemo(() => chartColors(bars.keys, theme.isDark), [bars.keys, theme.isDark]);
  const mix = useMemo(() => tokenMix(days), [days]);
  const mixColors = theme.isDark ? MIX_COLORS_DARK : MIX_COLORS_LIGHT;
  const selected = weeks.flatMap((week) => week.cells).find((cell) => cell.date === selectedDate) ?? null;
  const hero = metric === "cost" ? (overview?.summary.total_cost_usd ?? 0) : (overview?.summary.total_tokens ?? 0);
  const reload = () => {
    if (connected) refresh.mutate();
  };

  const metricSymbol: SFSymbol = metric === "cost" ? "dollarsign" : "chart.bar";
  const dimensionSymbol: SFSymbol = dimension === "model" ? "brain" : "person.2";

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeLargeTitleOptions("Token usage", theme.colors),
          headerTintColor: theme.colors.label,
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  headerIcon(metricSymbol, "Usage metric", () => setMetric((current) => (current === "tokens" ? "cost" : "tokens")), theme.colors.label, "usage-metric"),
                  headerIcon(dimensionSymbol, "Usage dimension", () => setDimension((current) => (current === "agent" ? "model" : "agent")), theme.colors.label, "usage-dimension"),
                ],
                unstable_headerRightItems: () => [
                  headerIcon("square.and.arrow.up", "Share", () => setShareOpen(true), theme.colors.label, "usage-share"),
                ],
              }
            : {
                headerLeft: () => (
                  <View style={styles.headerIcons}>
                    <Pressable accessibilityLabel="Usage metric" hitSlop={8} onPress={() => setMetric((current) => (current === "tokens" ? "cost" : "tokens"))}>
                      {metric === "cost" ? <DollarSignIcon color={theme.colors.label} size={22} /> : <CoinsIcon color={theme.colors.label} size={22} />}
                    </Pressable>
                    <Pressable accessibilityLabel="Usage dimension" hitSlop={8} onPress={() => setDimension((current) => (current === "agent" ? "model" : "agent"))}>
                      {dimension === "model" ? <BrainCircuitIcon color={theme.colors.label} size={22} /> : <BotIcon color={theme.colors.label} size={22} />}
                    </Pressable>
                  </View>
                ),
                headerRight: () => (
                  <Pressable accessibilityLabel="Share" hitSlop={12} onPress={() => setShareOpen(true)}>
                    <ShareIcon color={theme.colors.label} size={22} />
                  </Pressable>
                ),
              }),
        }}
      />
      <UsageScroll onRefresh={reload} refreshing={refresh.isPending || overviewQuery.isRefetching}>
        {!connected ? <Text style={{ color: theme.colors.secondaryLabel }}>Connect to a Computer to see token usage.</Text> : null}
        <InlineError message={overviewQuery.error instanceof Error ? overviewQuery.error.message : null} />
        <Text style={{ color: theme.colors.tertiaryLabel, fontSize: 12 }}>
          {overview ? `Updated ${formatUpdated(overview.generated_at)}` : "Local session history"}
        </Text>
        <AnimatedMetric
          format={(value) => formatMetric(value, metric)}
          style={[styles.hero, { color: theme.colors.label }]}
          value={hero}
        />
        <View style={{ gap: 12 }}>
          {shares.map((row) => {
            const color = colors.get(row.id) ?? theme.colors.label;
            return (
              <View key={row.id} style={{ gap: 6 }}>
                <View style={styles.row}>
                  {dimension === "agent" ? (
                    row.id === "other" ? <BotIcon color={color} size={16} /> : <MobileAgentIcon agentId={row.id} size={16} />
                  ) : (
                    <ProviderGlyph color={color} providerId={row.providerId ?? "unknown"} size={16} />
                  )}
                  <Text numberOfLines={1} style={[styles.label, { color: theme.colors.label }]}>{row.label}</Text>
                  <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{formatPercent(row.sharePercent)}</Text>
                  <AnimatedMetric format={(value) => formatMetric(value, metric)} style={{ color: theme.colors.label, fontVariant: ["tabular-nums"], fontWeight: "600" }} value={row.value} />
                </View>
                <View style={[styles.track, { backgroundColor: theme.colors.cardSubtle }]}>
                  <View style={{ backgroundColor: color, borderRadius: 999, height: "100%", width: `${Math.min(100, row.sharePercent)}%` }} />
                </View>
              </View>
            );
          })}
        </View>
        <View style={styles.grid}>
          <StatCard art="messages" label="Messages" note={`${overview?.by_client.length ?? 0} agents`} value={overview?.summary.total_messages ?? 0} />
          <StatCard art="days" label="Active days" note="Days with recorded usage" value={overview?.summary.active_days ?? 0} />
          <StatCard art="cost" label="Estimated cost" metric="cost" note="From local session history" value={overview?.summary.total_cost_usd ?? 0} />
          <StatCard art="tokens" label="Total tokens" note={overview?.summary.range_start && overview.summary.range_end ? `${overview.summary.range_start} – ${overview.summary.range_end}` : "All time"} value={overview?.summary.total_tokens ?? 0} />
        </View>
        <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.separator }]}>
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>Token mix</Text>
          <View style={[styles.track, { backgroundColor: theme.colors.cardSubtle, flexDirection: "row" }]}>
            {mix.map((slice, index) => slice.value > 0 ? <View key={slice.id} style={{ backgroundColor: mixColors[index], width: `${slice.sharePercent}%` }} /> : null)}
          </View>
          <View style={styles.legend}>
            {mix.map((slice, index) => (
              <Text key={slice.id} style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>
                {MIX_LABEL[slice.id]} {formatMetric(slice.value, "tokens")}
              </Text>
            ))}
          </View>
        </View>
        <View style={styles.row}>
          <Text style={[styles.section, { color: theme.colors.label }]}>Year</Text>
          {years.length > 0 ? (
            <MenuPicker
              onValueChange={(next) => { setYear(next); setSelectedDate(null); }}
              options={[...years].reverse().map((item) => ({ label: item, value: item }))}
              selectedValue={heatmapYear}
            />
          ) : null}
        </View>
        <UsageHeatmap
          monthLabels={monthLabels(weeks, heatmapYear)}
          onSelect={setSelectedDate}
          palette={theme.isDark ? HEATMAP_DARK : HEATMAP_LIGHT}
          selectedDate={selectedDate}
          weekdayColor={theme.colors.secondaryLabel}
          weeks={weeks}
        />
        {selected?.detail ? (
          <View style={{ gap: 4 }}>
            <Text style={[styles.section, { color: theme.colors.label }]}>{formatDay(selected.date)}</Text>
            <Detail label="Tokens" value={formatMetric(selected.detail.total_tokens, "tokens", "detailed")} />
            <Detail label="Cost" value={formatCurrencyDetailed(selected.detail.total_cost_usd)} />
            <Detail label="Messages" value={formatMetric(selected.detail.message_count, "tokens", "detailed")} />
          </View>
        ) : null}
        <NativeSegmentedControl
          onValueChange={setResolution}
          options={[{ label: "Month", value: "month" }, { label: "Day", value: "day" }]}
          selectedValue={resolution}
        />
        <ScrollableChart height={236} pointCount={series.length} pointWidth={36}>
          {({ width }) => (
            <View style={{ gap: 6, width }}>
              <UsageGrowthChart color={theme.isDark ? "#38BDF8" : "#0284C7"} height={210} values={series.map((point) => point.value)} width={width} />
              <ChartAxisLabels labels={series.map((point) => point.label)} />
            </View>
          )}
        </ScrollableChart>
        <ScrollableChart height={230} pointCount={bars.bars.length} pointWidth={44}>
          {({ width }) => (
            <View style={{ gap: 6, width }}>
              <UsageStackedChart colors={bars.keys.map((id) => barColors.get(id) ?? theme.colors.label)} height={200} series={bars.bars.map((bar) => bar.segments)} width={width} />
              <ChartAxisLabels labels={bars.bars.map((bar) => bar.label)} />
            </View>
          )}
        </ScrollableChart>
        <View style={styles.legend}>
          {bars.labels.map((label, index) => (
            <Text key={label} style={{ color: barColors.get(bars.keys[index] ?? "") ?? theme.colors.secondaryLabel, fontSize: 12 }}>{label}</Text>
          ))}
        </View>
      </UsageScroll>
      <ShareSheet
        isDark={theme.isDark}
        messages={overview?.summary.total_messages ?? 0}
        onDismiss={() => setShareOpen(false)}
        open={shareOpen}
        overview={overview}
        totalCost={overview?.summary.total_cost_usd ?? null}
        totalTokens={overview?.summary.total_tokens ?? 0}
      />
    </>
  );
}

function headerIcon(name: SFSymbol, label: string, onPress: () => void, tintColor: string, id: string) {
  return {
    accessibilityLabel: label,
    icon: { type: "sfSymbol" as const, name },
    identifier: id,
    label: "",
    onPress,
    sharesBackground: true,
    tintColor,
    type: "button" as const,
    variant: "plain" as const,
  };
}

function StatCard({
  art,
  label,
  metric = "tokens",
  note,
  value,
}: {
  art: StatArtKind;
  label: string;
  metric?: UsageMetric;
  note: string;
  value: number;
}) {
  const theme = useMobileTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.colors.card, borderColor: theme.colors.separator }]}>
      <Text style={{ color: theme.colors.tertiaryLabel, fontSize: 13 }}>{label}</Text>
      <AnimatedMetric format={(next) => formatMetric(next, metric)} style={[styles.statValue, { color: theme.colors.label }]} value={value} />
      <Text numberOfLines={2} style={{ color: theme.colors.secondaryLabel, fontSize: 12, marginTop: 6, paddingRight: 36 }}>{note}</Text>
      <View style={styles.art}>
        <StatArt color={theme.isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.18)"} kind={art} />
      </View>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const theme = useMobileTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: theme.colors.secondaryLabel, flex: 1 }}>{label}</Text>
      <Text style={{ color: theme.colors.label, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  art: { bottom: -8, position: "absolute", right: -6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  headerIcons: { alignItems: "center", flexDirection: "row", gap: 14 },
  hero: { fontSize: 40, fontVariant: ["tabular-nums"], fontWeight: "700" },
  label: { flex: 1, fontSize: 14, fontWeight: "600" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  panel: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 14 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  section: { flex: 1, fontSize: 16, fontWeight: "700" },
  stat: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, minHeight: 132, overflow: "hidden", padding: 14, width: "48%" },
  statValue: { fontSize: 26, fontVariant: ["tabular-nums"], fontWeight: "700", marginTop: 10 },
  track: { borderRadius: 999, height: 8, overflow: "hidden" },
});
