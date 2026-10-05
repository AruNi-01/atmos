import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Stack, useRouter } from "expo-router";
import type { QuotaProviderResponse } from "@atmos/api-types/ws/dto/quota";
import { AnimatedMetric } from "@/features/token-usage/animated-metric";
import { useMeterWidth } from "@/features/usage/use-meter-width";
import { UsageScroll } from "@/features/usage/usage-scroll";
import { useMobileTheme } from "@/theme/theme-store";
import { creditsLabel, extraSections, providerHeading, usageRows, type UsageRow } from "@/features/quota-usage/quota-rows";
import { useQuotaOverview } from "@/features/quota-usage/use-quota-overview";
import { ChevronDownIcon, SettingsIcon } from "@/ui/icons/lucide-native";
import { ProviderGlyph } from "@/ui/icons/provider-glyph";
import { InlineError } from "@/ui/layout/app-screen";
import { settingsHeaderItem } from "@/ui/navigation/home-header-items";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { IosPopover } from "@/ui/primitives/ios-popover";

const ALL = "all";
const FILTER_MAX_HEIGHT = 320;
const FILTER_MAX_WIDTH = 320;
const FILTER_ROW_HEIGHT = 44;
const FILTER_LIST_PADDING = 12;
/** Horizontal padding, glyph, and the gap before the label. */
const FILTER_ROW_CHROME = 14 * 2 + 18 + 12;

export function QuotaUsageScreen() {
  const theme = useMobileTheme();
  const router = useRouter();
  const { actionError, connected, overviewQuery, providers, refresh } = useQuotaOverview();
  const [selectedId, setSelectedId] = useState(ALL);
  const openSettings = () => router.push("/quota-settings");

  // The navbar and the usage list only show providers the user turned on.
  // The settings sheet still lists every provider so a hidden one can be turned back on.
  const shown = providers.filter((provider) => provider.switch_enabled);
  const activeId = selectedId === ALL || shown.some((provider) => provider.id === selectedId) ? selectedId : ALL;
  const selected = shown.find((provider) => provider.id === activeId) ?? null;
  const currentLabel = selected?.label ?? "All";
  const filterLabels = ["All", ...shown.map((provider) => provider.label)];
  const widestLabel = useWidestLabel(filterLabels);
  const filterWidth =
    widestLabel.width > 0
      ? Math.min(FILTER_MAX_WIDTH, Math.ceil(widestLabel.width) + FILTER_ROW_CHROME + 6)
      : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeLargeTitleOptions("AI quota usage", theme.colors),
          headerTintColor: theme.colors.label,
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "custom" as const,
                    element: (
                      <ProviderFilter label={currentLabel} menuWidth={filterWidth} onSelect={setSelectedId} providers={shown} />
                    ),
                  },
                ],
              }
            : {
                headerLeft: () => (
                  <ProviderFilter label={currentLabel} menuWidth={filterWidth} onSelect={setSelectedId} providers={shown} />
                ),
              }),
          ...(process.env.EXPO_OS === "ios"
            ? { unstable_headerRightItems: () => [settingsHeaderItem(openSettings, theme.colors.label)] }
            : {
                headerRight: () => (
                  <Pressable accessibilityLabel="Provider settings" hitSlop={12} onPress={openSettings}>
                    <SettingsIcon color={theme.colors.label} size={22} />
                  </Pressable>
                ),
              }),
        }}
      />
      <UsageScroll
        onRefresh={() => {
          if (connected) refresh.mutate();
        }}
        refreshing={refresh.isPending || overviewQuery.isRefetching}
      >
        {widestLabel.probe}
        {!connected ? <Text style={{ color: theme.colors.secondaryLabel }}>Connect to a Computer to see AI quota usage.</Text> : null}
        <InlineError message={overviewQuery.error instanceof Error ? overviewQuery.error.message : actionError} />
        {activeId === ALL
          ? shown.map((provider) => <ProviderCard key={provider.id} provider={provider} />)
          : selected
            ? <ProviderCard expanded provider={selected} />
            : null}
      </UsageScroll>
    </>
  );
}

function ProviderFilter({
  label,
  menuWidth,
  onSelect,
  providers,
}: {
  label: string;
  menuWidth?: number;
  onSelect: (id: string) => void;
  providers: QuotaProviderResponse[];
}) {
  const theme = useMobileTheme();
  const choices = [{ id: ALL, label: "All" }, ...providers.map((provider) => ({ id: provider.id, label: provider.label }))];
  const needsScroll = choices.length * FILTER_ROW_HEIGHT + FILTER_LIST_PADDING > FILTER_MAX_HEIGHT;
  const list = (
    <View style={[styles.filterList, menuWidth ? { width: menuWidth } : null]}>
      {choices.map((choice) => (
        <IosPopover.Pressable
          dismissOnPress
          key={choice.id}
          onPress={() => onSelect(choice.id)}
          style={styles.filterRow}
        >
          <ProviderGlyph color={theme.colors.label} providerId={choice.id} size={18} />
          <Text numberOfLines={1} style={[styles.filterLabel, { color: theme.colors.label }]}>{choice.label}</Text>
        </IosPopover.Pressable>
      ))}
    </View>
  );
  return (
    <IosPopover background="glass" direction="none">
      <IosPopover.Trigger>
        <View accessibilityLabel="Provider" accessibilityRole="button" style={styles.filterButton}>
          <Text numberOfLines={1} style={{ color: theme.colors.label, fontSize: 17, fontWeight: "600" }}>{label}</Text>
        </View>
      </IosPopover.Trigger>
      <IosPopover.Content
        style={{
          alignSelf: "flex-start",
          backgroundColor: theme.colors.cardElevated,
          width: menuWidth,
        }}
      >
        {needsScroll && menuWidth ? (
          <ScrollView
            contentInsetAdjustmentBehavior="never"
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator
            style={{ height: FILTER_MAX_HEIGHT, width: menuWidth }}
          >
            {list}
          </ScrollView>
        ) : (
          list
        )}
      </IosPopover.Content>
    </IosPopover>
  );
}

/** Widest label. Measured on the page, not in the narrow header button. */
function useWidestLabel(labels: readonly string[]) {
  const [width, setWidth] = useState(0);
  const measured = useRef(new Map<number, number>());
  const key = labels.join("\n");
  const keyRef = useRef(key);
  if (keyRef.current !== key) {
    keyRef.current = key;
    measured.current = new Map();
  }

  const probe = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.filterProbe}
    >
      {labels.map((label, index) => (
        <Text
          key={`${key}:${index}`}
          onTextLayout={(event) => {
            if (keyRef.current !== key) return;
            const lineWidth = event.nativeEvent.lines.reduce((sum, line) => sum + line.width, 0);
            measured.current.set(index, lineWidth);
            if (measured.current.size < labels.length) return;
            const next = Math.max(0, ...measured.current.values());
            setWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
          }}
          style={styles.filterProbeText}
        >
          {label}
        </Text>
      ))}
    </View>
  );

  return { probe, width };
}

function ProviderCard({ expanded = false, provider }: { expanded?: boolean; provider: QuotaProviderResponse }) {
  const theme = useMobileTheme();
  const [open, setOpen] = useState(expanded);
  const rows = usageRows(provider);
  const extras = extraSections(provider);
  const credits = creditsLabel(provider);
  const heading = providerHeading(provider);
  const metric = rows[0] ?? null;
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.separator }]}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.row}>
        <ProviderGlyph color={theme.colors.label} providerId={provider.id} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.label, fontWeight: "700" }}>{provider.label}</Text>
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>
            {provider.enabled ? (heading.plan ?? metric?.label ?? "Usage") : "Not detected"}
          </Text>
        </View>
        {provider.enabled && metric?.percent != null ? (
          <QuotaPercent
            style={{ color: theme.colors.label, fontVariant: ["tabular-nums"], fontWeight: "700" }}
            value={metric.percent}
          />
        ) : null}
        <CollapseChevron open={open} />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ gap: 14 }}>
          {heading.account || heading.plan ? (
            <View style={{ alignItems: "flex-end" }}>
              {heading.account ? <Text style={{ color: theme.colors.label, fontSize: 13 }}>{heading.account}</Text> : null}
              {heading.plan ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>{heading.plan}</Text> : null}
            </View>
          ) : null}
          {rows.map((row, index) => (
            <UsageLine key={row.key} row={row} showGroup={Boolean(row.group) && row.group !== rows[index - 1]?.group} />
          ))}
          {credits ? (
            <View style={styles.row}>
              <Text style={{ color: theme.colors.label, flex: 1, fontWeight: "600" }}>Credits</Text>
              <Text style={{ color: theme.colors.label }}>{credits}</Text>
            </View>
          ) : null}
          {extras.map((section) => (
            <View key={section.title} style={{ gap: 8 }}>
              <View style={styles.row}>
                <Text style={{ color: theme.colors.label, flex: 1, fontWeight: "700" }}>{section.title}</Text>
                {section.headerValue ? <Text style={{ color: theme.colors.secondaryLabel }}>{section.headerValue}</Text> : null}
              </View>
              {section.rows.map((row) => {
                const amount = moneyAfterUsed(row.value);
                return (
                  <View key={row.key} style={{ gap: 6 }}>
                    <View style={styles.metricLine}>
                      {row.percent != null ? (
                        <PercentLabel label={row.label} percent={row.percent} />
                      ) : (
                        <Text ellipsizeMode="tail" numberOfLines={1} style={{ color: theme.colors.label, flex: 1, fontSize: 13 }}>{row.label}</Text>
                      )}
                      {row.resetText ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{row.resetText}</Text> : null}
                      {row.percent == null && row.value ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{row.value}</Text> : null}
                    </View>
                    {row.percent != null && amount ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{amount}</Text> : null}
                    {row.percent != null ? <UsageTrack percent={row.percent} /> : null}
                  </View>
                );
              })}
            </View>
          ))}
          {rows.length === 0 && extras.length === 0 && !credits ? <Text style={{ color: theme.colors.secondaryLabel }}>No usage data</Text> : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function moneyAfterUsed(value: string): string | null {
  const rest = value.replace(/(\d+(?:\.\d+)?)%\s*used/i, "").replace(/^[\s·]+/, "").trim();
  return rest || null;
}

function CollapseChevron({ open }: { open: boolean }) {
  const theme = useMobileTheme();
  const rotation = useSharedValue(open ? 180 : 0);
  useEffect(() => {
    rotation.value = withTiming(open ? 180 : 0, { duration: 220 });
  }, [open, rotation]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return (
    <Animated.View style={[styles.chevron, style]}>
      <ChevronDownIcon color={theme.colors.tertiaryLabel} size={16} />
    </Animated.View>
  );
}

function UsageLine({ row, showGroup }: { row: UsageRow; showGroup: boolean }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: 6 }}>
      {showGroup && row.group ? <Text style={{ color: theme.colors.label, fontWeight: "700" }}>{row.group}</Text> : null}
      <View style={styles.metricLine}>
        {row.percent != null ? (
          <PercentLabel label={row.label} percent={row.percent} />
        ) : (
          <Text ellipsizeMode="tail" numberOfLines={1} style={{ color: theme.colors.label, flex: 1, fontSize: 13 }}>
            {row.label} · {row.usedText}
          </Text>
        )}
        {row.resetText ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{row.resetText}</Text> : null}
      </View>
      {row.detailText ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{row.detailText}</Text> : null}
      {row.percent != null ? <UsageTrack percent={row.percent} segments={row.segments} /> : null}
      {row.segments.length > 0 ? (
        <View style={styles.segmentLegend}>
          {row.segments.map((segment, index) => (
            <View key={segment.label} style={styles.segmentItem}>
              {index > 0 ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>·</Text> : null}
              <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{segment.label}</Text>
              <QuotaPercent
                style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}
                value={segment.percent}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function QuotaPercent({ style, value }: { style?: StyleProp<TextStyle>; value: number }) {
  return <AnimatedMetric format={(next) => `${Math.round(next)}%`} style={style} value={value} />;
}

function PercentLabel({ label, percent }: { label: string; percent: number }) {
  const theme = useMobileTheme();
  const text = { color: theme.colors.label, fontSize: 13 };
  return (
    <View style={styles.percentLabel}>
      <Text ellipsizeMode="tail" numberOfLines={1} style={[text, { flexShrink: 1 }]}>{label} ·</Text>
      <QuotaPercent style={text} value={percent} />
      <Text style={text}>used</Text>
    </View>
  );
}

function MeterSegment({ color, opacity, percent }: { color: string; opacity: number; percent: number }) {
  const width = useMeterWidth(percent);
  return <Animated.View style={[{ backgroundColor: color, height: "100%", opacity }, width]} />;
}

function UsageTrack({ percent, segments = [] }: { percent: number; segments?: UsageSegment[] }) {
  const theme = useMobileTheme();
  const fills = segments.length > 0 ? segments : [{ label: "used", percent }];
  return (
    <View style={[styles.track, { backgroundColor: theme.colors.cardSubtle }]}>
      {fills.map((segment, index) => (
        <MeterSegment
          color={theme.colors.label}
          key={segment.label}
          opacity={segments.length > 0 ? 1 - index * 0.28 : 1}
          percent={segment.percent}
        />
      ))}
    </View>
  );
}

type UsageSegment = UsageRow["segments"][number];

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 12 },
  chevron: { alignItems: "center", height: 16, justifyContent: "center", width: 16 },
  filterButton: { alignItems: "center", flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8 },
  filterLabel: { flexGrow: 1, flexShrink: 1, fontSize: 17 },
  filterList: { paddingVertical: 6 },
  filterProbe: { opacity: 0, position: "absolute" },
  filterProbeText: { fontSize: 17, width: 1000 },
  filterRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: FILTER_ROW_HEIGHT,
    paddingHorizontal: 14,
  },
  metricLine: { alignItems: "center", flexDirection: "row", gap: 12 },
  percentLabel: { alignItems: "center", flex: 1, flexDirection: "row", gap: 4, minWidth: 0 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  segmentItem: { alignItems: "center", flexDirection: "row", gap: 4 },
  segmentLegend: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 4 },
  track: { borderRadius: 999, flexDirection: "row", height: 6, overflow: "hidden" },
});
