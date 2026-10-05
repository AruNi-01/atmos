import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as RNImage, Pressable, StyleSheet, Text, View, type ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Host } from "@expo/ui";
import { MenuView } from "@expo/ui/community/menu";
import { Image } from "@expo/ui/swift-ui";
import { Stack, type NativeStackHeaderItem } from "expo-router";
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition, useReducedMotion, useSharedValue } from "react-native-reanimated";
import type { SFSymbol } from "sf-symbols-typescript";
import type { DailyTokenUsageResponse } from "@atmos/api-types/ws/dto/token-usage";
import { wsActions } from "@/api/ws-actions";
import { AnimatedMetric } from "@/features/token-usage/animated-metric";
import { ScrollableChart, UsageGrowthChart, UsageHeatmap, UsageStackedChart } from "@/features/token-usage/charts";
import { formatCurrencyDetailed, formatMetric, formatPercent } from "@/features/token-usage/format";
import { METRIC_TWEEN_MS } from "@/features/token-usage/tween-series";
import {
  buildHeatmap,
  chartColors,
  formatDayTitle,
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
import { captureUsageImage, releaseUsageImage, type UsageShot } from "@/features/token-usage/capture-usage-image";
import { ShareSheet } from "@/features/token-usage/ShareSheet";
import { StatArt, type StatArtKind } from "@/features/token-usage/stat-art";
import { UsageModelIcon } from "@/features/token-usage/UsageModelIcon";
import { useMeterWidth } from "@/features/usage/use-meter-width";
import { UsageScroll } from "@/features/usage/usage-scroll";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useMobileTheme } from "@/theme/theme-store";
import { AtmosLogo } from "@/ui/AtmosLogo";
import { BotIcon, BrainCircuitIcon, CoinsIcon, DollarSignIcon, ShareIcon } from "@/ui/icons/lucide-native";
import { InlineError } from "@/ui/layout/app-screen";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { MenuPicker } from "@/ui/primitives/menu-picker";
import { NativeSegmentedControl } from "@/ui/primitives/native-segmented-control";

const MIX_LABEL = { input: "Input", output: "Output", cacheRead: "Cache read", cacheWrite: "Cache write", reasoning: "Reasoning" } as const;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

const METRIC_SYMBOL = { tokens: "centsign.circle", cost: "dollarsign" } as const satisfies Record<UsageMetric, SFSymbol>;
const DIMENSION_SYMBOL = { agent: "cpu", model: "brain" } as const satisfies Record<UsageDimension, SFSymbol>;

export function TokenUsageScreen() {
  const theme = useMobileTheme();
  const safeTop = useSafeAreaInsets().top;
  const safeTopRef = useRef(safeTop);
  safeTopRef.current = safeTop;
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
  const usageContentRef = useRef<View>(null);
  const usageScrollRef = useRef<ScrollView>(null);
  const captureShift = useSharedValue(0);
  const setFreezeRef = useRef<(uri: string | null) => void>(() => {});
  const freezeUriRef = useRef<string | null>(null);
  const openingShare = useRef(false);
  const shotRequest = useRef<Promise<UsageShot> | null>(null);
  const captureUsage = useCallback(() => {
    if (!shotRequest.current) {
      shotRequest.current = captureUsageImage({
        contentRef: usageContentRef,
        safeTop: safeTopRef.current,
        scrollRef: usageScrollRef,
        setFreeze: (uri) => {
          if (!openingShare.current) {
            if (uri) releaseUsageImage(uri);
            return;
          }
          const previous = freezeUriRef.current;
          freezeUriRef.current = uri;
          setFreezeRef.current(uri);
          if (previous && previous !== uri) releaseUsageImage(previous);
        },
        shift: captureShift,
      });
    }
    return shotRequest.current;
  }, [captureShift]);
  const openShare = useCallback(() => {
    if (openingShare.current) return;
    openingShare.current = true;
    setShareOpen(true);
  }, []);
  const closeShare = useCallback(() => {
    openingShare.current = false;
    shotRequest.current = null;
    const uri = freezeUriRef.current;
    freezeUriRef.current = null;
    setFreezeRef.current(null);
    setShareOpen(false);
    if (uri) requestAnimationFrame(() => releaseUsageImage(uri));
  }, []);
  const reducedMotion = useReducedMotion();
  const heatmapLayout = useMemo(
    () => LinearTransition.duration(reducedMotion ? 1 : 240).easing(EASE_IN_OUT),
    [reducedMotion],
  );
  const detailEnter = useMemo(
    () => (reducedMotion
      ? FadeIn.duration(120)
      : FadeInDown.duration(220).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })),
    [reducedMotion],
  );
  const detailExit = useMemo(
    () => (reducedMotion ? FadeOut.duration(80) : FadeOutDown.duration(180).easing(EASE_OUT)),
    [reducedMotion],
  );

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
  const modelProviders = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of overview?.by_model ?? []) {
      if (row.provider_id) map.set(row.model_id, row.provider_id);
    }
    return map;
  }, [overview?.by_model]);
  const mixColors = theme.isDark ? MIX_COLORS_DARK : MIX_COLORS_LIGHT;
  const selected = weeks.flatMap((week) => week.cells).find((cell) => cell.date === selectedDate) ?? null;
  const openDetail = selected?.detail ?? null;
  const heatmapSurface = theme.colors.card;
  const detailSurface = theme.isDark ? theme.colors.controlElevated : theme.colors.background;
  const selectDay = (date: string) => {
    const cell = weeks.flatMap((week) => week.cells).find((item) => item.date === date);
    if (!cell?.detail) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate((current) => (current === date ? null : date));
  };
  const hero = metric === "cost" ? (overview?.summary.total_cost_usd ?? 0) : (overview?.summary.total_tokens ?? 0);
  const reload = useCallback(() => {
    if (connected) refresh.mutate();
  }, [connected, refresh]);
  const loadingPage =
    overview == null &&
    overviewQuery.isPending &&
    (overviewQuery.isFetching ||
      connected ||
      state === "connecting" ||
      state === "reconnecting" ||
      (state === "idle" && wsUrl != null));

  // Keep this identity stable while a share capture is open.
  // A navigation-option change while the sheet is presented dismisses it and restarts the loader.
  const screenOptions = useMemo(
    () => ({
      ...nativeLargeTitleOptions("Token usage", theme.colors),
      headerShown: !loadingPage,
      headerTintColor: theme.colors.label,
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "custom" as const,
                    element: (
                      <View style={styles.headerIcons}>
                        <HeaderChoice
                          accessibilityLabel="Usage metric"
                          actions={[
                            { id: "tokens", image: METRIC_SYMBOL.tokens, state: metric === "tokens" ? "on" : "off", title: "Tokens" },
                            { id: "cost", image: METRIC_SYMBOL.cost, state: metric === "cost" ? "on" : "off", title: "Cost" },
                          ]}
                          onAction={(id) => setMetric(id === "cost" ? "cost" : "tokens")}
                        >
                          <SymbolMark name={METRIC_SYMBOL[metric]} />
                        </HeaderChoice>
                        <HeaderChoice
                          accessibilityLabel="Usage dimension"
                          actions={[
                            { id: "agent", image: DIMENSION_SYMBOL.agent, state: dimension === "agent" ? "on" : "off", title: "Agent" },
                            { id: "model", image: DIMENSION_SYMBOL.model, state: dimension === "model" ? "on" : "off", title: "Model" },
                          ]}
                          onAction={(id) => setDimension(id === "model" ? "model" : "agent")}
                        >
                          <SymbolMark name={DIMENSION_SYMBOL[dimension]} />
                        </HeaderChoice>
                      </View>
                    ),
                  },
                ],
                unstable_headerRightItems: () => [
                  headerIcon("square.and.arrow.up", "Share", openShare, theme.colors.label, "usage-share"),
                ],
              }
            : {
                headerLeft: () => (
                  <View style={styles.headerIcons}>
                    <HeaderChoice
                      accessibilityLabel="Usage metric"
                      actions={[
                        { id: "tokens", state: metric === "tokens" ? "on" : "off", title: "Tokens" },
                        { id: "cost", state: metric === "cost" ? "on" : "off", title: "Cost" },
                      ]}
                      onAction={(id) => setMetric(id === "cost" ? "cost" : "tokens")}
                    >
                      {metric === "cost" ? <DollarSignIcon color={theme.colors.label} size={16} /> : <CoinsIcon color={theme.colors.label} size={16} />}
                    </HeaderChoice>
                    <HeaderChoice
                      accessibilityLabel="Usage dimension"
                      actions={[
                        { id: "agent", state: dimension === "agent" ? "on" : "off", title: "Agent" },
                        { id: "model", state: dimension === "model" ? "on" : "off", title: "Model" },
                      ]}
                      onAction={(id) => setDimension(id === "model" ? "model" : "agent")}
                    >
                      {dimension === "model" ? <BrainCircuitIcon color={theme.colors.label} size={16} /> : <BotIcon color={theme.colors.label} size={16} />}
                    </HeaderChoice>
                  </View>
                ),
                headerRight: () => (
                  <Pressable accessibilityLabel="Share" hitSlop={12} onPress={openShare}>
                    <ShareIcon color={theme.colors.label} size={22} />
                  </Pressable>
                ),
              }),
    }),
    [dimension, loadingPage, metric, openShare, theme.colors],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      {loadingPage ? <UsageLoading /> : (
      <UsageCaptureFrame setFreezeRef={setFreezeRef}>
      <UsageScroll
        contentRef={usageContentRef}
        onRefresh={reload}
        refreshing={refresh.isPending || overviewQuery.isRefetching}
        scrollRef={usageScrollRef}
        shift={captureShift}
      >
        {!connected ? <Text style={{ color: theme.colors.secondaryLabel }}>Connect to a Computer to see token usage.</Text> : null}
        <InlineError message={overviewQuery.error instanceof Error ? overviewQuery.error.message : null} />
        {!overview ? <Text style={{ color: theme.colors.tertiaryLabel, fontSize: 12 }}>Local session history</Text> : null}
        <AnimatedMetric
          format={(value) => formatMetric(value, metric)}
          style={[styles.hero, { color: theme.colors.label }]}
          value={hero}
        />
        <View style={{ gap: 12 }}>
          {shares.map((row, index) => {
            const color = colors.get(row.id) ?? theme.colors.label;
            return (
              <View key={`share-${index}`} style={{ gap: 6 }}>
                <View style={styles.row}>
                  <Animated.View
                    entering={reducedMotion ? undefined : FadeIn.duration(180)}
                    key={row.id}
                    style={styles.identity}
                  >
                    {dimension === "agent" ? (
                      row.id === "other" ? <BotIcon color={color} size={16} /> : <MobileAgentIcon agentId={row.id} size={16} />
                    ) : (
                      <UsageModelIcon modelId={row.id} providerId={row.providerId} size={16} />
                    )}
                    <Text numberOfLines={1} style={[styles.label, { color: theme.colors.label }]}>{row.label}</Text>
                  </Animated.View>
                  <AnimatedMetric
                    format={formatPercent}
                    style={{ color: theme.colors.secondaryLabel, fontSize: 12, fontVariant: ["tabular-nums"] }}
                    value={row.sharePercent}
                  />
                  <AnimatedMetric
                    format={(value) => formatMetric(value, metric)}
                    style={{ color: theme.colors.label, fontVariant: ["tabular-nums"], fontWeight: "600" }}
                    value={row.value}
                  />
                </View>
                <ShareBar color={color} percent={row.sharePercent} trackColor={theme.colors.cardSubtle} />
              </View>
            );
          })}
        </View>
        <View style={styles.grid}>
          <StatCard art="messages" label="Messages" value={overview?.summary.total_messages ?? 0} />
          <StatCard art="days" label="Active days" value={overview?.summary.active_days ?? 0} />
          <StatCard art="cost" label="Estimated cost" metric="cost" value={overview?.summary.total_cost_usd ?? 0} />
          <StatCard art="tokens" label="Total tokens" value={overview?.summary.total_tokens ?? 0} />
        </View>
        <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.separator }]}>
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>Token mix</Text>
          <View style={[styles.track, { backgroundColor: theme.colors.cardSubtle, flexDirection: "row" }]}>
            {mix.map((slice, index) => slice.value > 0 ? <View key={slice.id} style={{ backgroundColor: mixColors[index], width: `${slice.sharePercent}%` }} /> : null)}
          </View>
          <View style={styles.legend}>
            {mix.map((slice, index) => (
              <View key={slice.id} style={styles.legendItem}>
                <View style={{ backgroundColor: mixColors[index], borderRadius: 4, height: 8, width: 8 }} />
                <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>
                  {MIX_LABEL[slice.id]} {formatMetric(slice.value, "tokens")}
                </Text>
              </View>
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
        <Animated.View
          collapsable={false}
          layout={heatmapLayout}
          style={[styles.heatmapCard, { backgroundColor: heatmapSurface, borderColor: theme.colors.separator }]}
        >
          <View style={styles.heatmapClip}>
            <View style={{ paddingBottom: openDetail ? 8 : 14, paddingHorizontal: 14, paddingTop: 14 }}>
              <UsageHeatmap
                monthLabels={monthLabels(weeks, heatmapYear)}
                onSelect={selectDay}
                palette={theme.isDark ? HEATMAP_DARK : HEATMAP_LIGHT}
                selectedDate={selectedDate}
                weekdayColor={theme.colors.secondaryLabel}
                weeks={weeks}
              />
            </View>
            {openDetail && selected ? (
              <Animated.View
                entering={detailEnter}
                exiting={detailExit}
                style={[styles.heatmapDetail, { backgroundColor: detailSurface }]}
              >
                <DayUsage date={selected.date} detail={openDetail} />
              </Animated.View>
            ) : null}
          </View>
        </Animated.View>
        <NativeSegmentedControl
          onValueChange={setResolution}
          options={[{ label: "Month", value: "month" }, { label: "Day", value: "day" }]}
          selectedValue={resolution}
        />
        <ScrollableChart height={220}>
          {({ width }) => (
            <UsageGrowthChart
              color={theme.colors.label}
              formatValue={(value) => formatMetric(value, metric)}
              height={220}
              labelColor={theme.colors.secondaryLabel}
              labels={series.map((point) => point.label)}
              values={series.map((point) => point.value)}
              width={width}
            />
          )}
        </ScrollableChart>
        <ScrollableChart height={220}>
          {({ width }) => (
            <UsageStackedChart
              colors={bars.keys.map((id) => barColors.get(id) ?? theme.colors.label)}
              dimension={dimension}
              formatValue={(value) => formatMetric(value, metric)}
              height={220}
              ids={bars.keys}
              labelColor={theme.colors.secondaryLabel}
              labels={bars.bars.map((bar) => bar.label)}
              names={bars.labels}
              providers={modelProviders}
              series={bars.bars.map((bar) => bar.segments)}
              width={width}
            />
          )}
        </ScrollableChart>
        <View style={styles.legend}>
          {bars.labels.map((label, index) => {
            const id = bars.keys[index] ?? "";
            const color = barColors.get(id) ?? theme.colors.secondaryLabel;
            return (
              <Animated.View
                entering={reducedMotion ? undefined : FadeIn.duration(180)}
                key={id || label}
                style={styles.legendItem}
              >
                {dimension === "model" ? (
                  <UsageModelIcon color={color} modelId={id} providerId={modelProviders.get(id)} size={14} />
                ) : id === "other" ? (
                  <BotIcon color={color} size={14} />
                ) : (
                  <MobileAgentIcon agentId={id} size={14} />
                )}
                <Text style={{ color, fontSize: 12 }}>{label}</Text>
              </Animated.View>
            );
          })}
        </View>
        {overview ? (
          <Text style={{ color: theme.colors.tertiaryLabel, fontSize: 12, textAlign: "right" }}>
            Updated {formatUpdated(overview.generated_at)}
          </Text>
        ) : null}
      </UsageScroll>
      </UsageCaptureFrame>
      )}
      <ShareSheet
        capture={captureUsage}
        onDismiss={closeShare}
        open={shareOpen}
        overview={overview}
        totalCost={overview?.summary.total_cost_usd ?? null}
        totalTokens={overview?.summary.total_tokens ?? 0}
      />
    </>
  );
}

function UsageCaptureFrame({
  children,
  setFreezeRef,
}: {
  children: ReactNode;
  setFreezeRef: RefObject<(uri: string | null) => void>;
}) {
  const [uri, setUri] = useState<string | null>(null);
  setFreezeRef.current = setUri;
  return (
    <View style={styles.page}>
      {children}
      {uri ? (
        <View pointerEvents="auto" style={StyleSheet.absoluteFill}>
          <RNImage source={{ uri }} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}
    </View>
  );
}

function UsageLoading() {
  const theme = useMobileTheme();

  return (
    <View
      accessibilityRole="progressbar"
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.background,
        flex: 1,
        justifyContent: "center",
      }}
    >
      <AtmosLogo breathe />
    </View>
  );
}

function headerIcon(name: SFSymbol, label: string, onPress: () => void, tintColor: string, id: string): NativeStackHeaderItem {
  return {
    accessibilityLabel: label,
    icon: { type: "sfSymbol", name },
    identifier: id,
    label: "",
    onPress,
    sharesBackground: true,
    tintColor,
    type: "button",
    variant: "plain",
  };
}

function SymbolMark({ name }: { name: SFSymbol }) {
  const theme = useMobileTheme();
  return (
    <Host colorScheme={theme.colorScheme} matchContents seedColor={theme.colors.label}>
      <Image size={22} systemName={name} />
    </Host>
  );
}

function HeaderChoice({
  accessibilityLabel,
  actions,
  children,
  onAction,
}: {
  accessibilityLabel: string;
  actions: Array<{ id: string; image?: SFSymbol; state: "on" | "off"; title: string }>;
  children: ReactNode;
  onAction: (id: string) => void;
}) {
  return (
    <MenuView actions={actions} onPressAction={(event) => onAction(event.nativeEvent.event)} shouldOpenOnLongPress={false}>
      <View accessibilityLabel={accessibilityLabel} accessibilityRole="button" style={styles.headerChoice}>
        {children}
      </View>
    </MenuView>
  );
}

function ShareBar({ color, percent, trackColor }: { color: string; percent: number; trackColor: string }) {
  const reducedMotion = useReducedMotion();
  const fill = useMeterWidth(percent);
  return (
    <View style={[styles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          {
            backgroundColor: color,
            borderRadius: 999,
            bottom: 0,
            left: 0,
            position: "absolute",
            top: 0,
            transitionDuration: reducedMotion ? 0 : METRIC_TWEEN_MS,
            transitionProperty: "backgroundColor",
            transitionTimingFunction: "ease-out",
          },
          fill,
        ]}
      />
    </View>
  );
}

function StatCard({
  art,
  label,
  metric = "tokens",
  value,
}: {
  art: StatArtKind;
  label: string;
  metric?: UsageMetric;
  value: number;
}) {
  const theme = useMobileTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.colors.card, borderColor: theme.colors.separator }]}>
      <Text style={{ color: theme.colors.tertiaryLabel, fontSize: 13 }}>{label}</Text>
      <AnimatedMetric format={(next) => formatMetric(next, metric)} style={[styles.statValue, { color: theme.colors.label }]} value={value} />
      <View pointerEvents="none" style={styles.art}>
        <StatArt color={theme.isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.16)"} kind={art} />
      </View>
    </View>
  );
}

function DayUsage({ date, detail }: { date: string; detail: DailyTokenUsageResponse }) {
  const theme = useMobileTheme();
  const agents = dayAgentIds(detail.by_client ?? []);
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: theme.colors.label, fontSize: 16, fontWeight: "600" }}>{formatDayTitle(date)}</Text>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <DayMetric label="Tokens" value={formatMetric(detail.total_tokens, "tokens", "detailed")} />
        <DayMetric label="Cost" value={formatCurrencyDetailed(detail.total_cost_usd)} />
      </View>
      <View style={styles.agentRow}>
        {agents.map((id) => (
          <View key={id} style={[styles.agentChip, { backgroundColor: theme.isDark ? "rgba(0,0,0,0.35)" : theme.colors.cardSubtle }]}>
            {id === "other" ? <BotIcon color={theme.colors.label} size={14} /> : <MobileAgentIcon agentId={id} size={14} />}
            <Text numberOfLines={1} style={{ color: theme.colors.label, fontSize: 13, fontWeight: "600" }}>{agentName(id)}</Text>
          </View>
        ))}
        <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>
          {formatMetric(detail.message_count, "tokens", "detailed")} {detail.message_count === 1 ? "message" : "messages"}
        </Text>
      </View>
    </View>
  );
}

function DayMetric({ label, value }: { label: string; value: string }) {
  const theme = useMobileTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{ color: theme.colors.label, fontSize: 17, fontVariant: ["tabular-nums"], fontWeight: "700" }}
      >
        {value}
      </Text>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function dayAgentIds(rows: DailyTokenUsageResponse["by_client"]) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.client_id, (totals.get(row.client_id) ?? 0) + row.total_tokens);
  return [...totals.entries()].sort((left, right) => right[1] - left[1]).map(([id]) => id);
}

function agentName(id: string) {
  const leaf = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  const name = leaf
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return name || "Agent";
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  art: { bottom: -10, position: "absolute", right: -8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  agentChip: { alignItems: "center", borderRadius: 8, flexDirection: "row", gap: 6, maxWidth: "100%", paddingHorizontal: 8, paddingVertical: 5 },
  agentRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  headerChoice: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  headerIcons: { alignItems: "center", flexDirection: "row", height: 44 },
  heatmapCard: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  heatmapClip: { borderRadius: 20, overflow: "hidden" },
  heatmapDetail: { borderRadius: 16, marginBottom: 10, marginHorizontal: 10, paddingHorizontal: 14, paddingVertical: 14 },
  hero: { fontSize: 40, fontVariant: ["tabular-nums"], fontWeight: "700" },
  identity: { alignItems: "center", flex: 1, flexDirection: "row", gap: 8, minWidth: 0 },
  label: { flex: 1, fontSize: 14, fontWeight: "600", minWidth: 0 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 6 },
  panel: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 14 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  section: { flex: 1, fontSize: 16, fontWeight: "700" },
  stat: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, minHeight: 108, overflow: "hidden", padding: 14, width: "48%" },
  statValue: { fontSize: 26, fontVariant: ["tabular-nums"], fontWeight: "700", marginTop: 10 },
  track: { borderRadius: 999, height: 8, overflow: "hidden" },
});
