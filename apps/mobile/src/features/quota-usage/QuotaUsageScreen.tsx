import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import type { QuotaOverviewResponse, QuotaProviderResponse } from "@atmos/api-types/ws/dto/quota";
import { wsActions } from "@/api/ws-actions";
import { UsageScroll } from "@/features/usage/usage-scroll";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useMobileTheme } from "@/theme/theme-store";
import { creditsLabel, extraSections, providerHeading, usageRows, type UsageRow } from "@/features/quota-usage/quota-rows";
import { ChevronDownIcon, ChevronUpIcon, SettingsIcon } from "@/ui/icons/lucide-native";
import { ProviderGlyph } from "@/ui/icons/provider-glyph";
import { InlineError } from "@/ui/layout/app-screen";
import { settingsHeaderItem } from "@/ui/navigation/home-header-items";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { IosPopover } from "@/ui/primitives/ios-popover";
import { MenuPickerRow } from "@/ui/primitives/menu-picker";
import { NativeSwitch } from "@/ui/primitives/native-controls";

const ALL = "all";
const REFRESH_OPTIONS = [
  { label: "Off", value: "off" },
  { label: "1 min", value: "1" },
  { label: "5 min", value: "5" },
  { label: "15 min", value: "15" },
  { label: "30 min", value: "30" },
  { label: "1 hour", value: "60" },
];

export function QuotaUsageScreen() {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const settingsHeight = Math.max(280, Math.round(useWindowDimensions().height * 0.72) - 28);
  const queryClient = useQueryClient();
  const { client, state } = useMobileWs();
  const wsUrl = useSessionStore((store) => store.activeClientSession?.ws_url ?? null);
  const connected = state === "open" && client != null;
  const queryKey = ["quota-overview", wsUrl] as const;
  const [selectedId, setSelectedId] = useState(ALL);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey,
    enabled: connected,
    queryFn: () => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      return wsActions.quotaOverview(client, { refresh: false, provider_id: null });
    },
  });
  const write = (overview: QuotaOverviewResponse) => {
    setActionError(null);
    queryClient.setQueryData(queryKey, overview);
  };
  const refresh = useMutation({
    mutationFn: () => wsActions.quotaOverview(client!, { refresh: true, provider_id: null }),
    onSuccess: write,
  });
  const toggleOne = useMutation({
    mutationFn: (input: { enabled: boolean; providerId: string }) =>
      wsActions.quotaSetProviderSwitch(client!, input.providerId, input.enabled),
    onMutate: (input) => {
      const previous = queryClient.getQueryData<QuotaOverviewResponse>(queryKey);
      if (previous) {
        queryClient.setQueryData<QuotaOverviewResponse>(queryKey, {
          ...previous,
          providers: previous.providers.map((provider) =>
            provider.id === input.providerId ? { ...provider, switch_enabled: input.enabled } : provider,
          ),
        });
      }
      setActionError(null);
      return { previous };
    },
    onSuccess: write,
    onError: (error: unknown, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setActionError(actionMessage(error));
    },
  });
  const toggleAll = useMutation({
    mutationFn: (enabled: boolean) => wsActions.quotaSetAllProvidersSwitch(client!, enabled),
    onMutate: (enabled) => {
      const previous = queryClient.getQueryData<QuotaOverviewResponse>(queryKey);
      if (previous) {
        queryClient.setQueryData<QuotaOverviewResponse>(queryKey, {
          ...previous,
          providers: previous.providers.map((provider) => ({ ...provider, switch_enabled: enabled })),
        });
      }
      setActionError(null);
      return { previous };
    },
    onSuccess: write,
    onError: (error: unknown, _enabled, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setActionError(actionMessage(error));
    },
  });
  const autoRefresh = useMutation({
    mutationFn: (minutes: number | null) => wsActions.quotaSetAutoRefresh(client!, minutes),
    onSuccess: write,
    onError: (error: unknown) => setActionError(actionMessage(error)),
  });

  const overview = overviewQuery.data ?? null;
  const providers = [...(overview?.providers ?? [])].sort((left, right) => left.label.localeCompare(right.label));
  const activeId = selectedId === ALL || providers.some((provider) => provider.id === selectedId) ? selectedId : ALL;
  const selected = providers.find((provider) => provider.id === activeId) ?? null;
  const currentLabel = selected?.label ?? "All";

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
                      <ProviderFilter label={currentLabel} onSelect={setSelectedId} providers={providers} />
                    ),
                  },
                ],
              }
            : {
                headerLeft: () => (
                  <ProviderFilter label={currentLabel} onSelect={setSelectedId} providers={providers} />
                ),
              }),
          ...(process.env.EXPO_OS === "ios"
            ? { unstable_headerRightItems: () => [settingsHeaderItem(() => setSettingsOpen(true), theme.colors.label)] }
            : {
                headerRight: () => (
                  <Pressable accessibilityLabel="Provider settings" hitSlop={12} onPress={() => setSettingsOpen(true)}>
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
        {!connected ? <Text style={{ color: theme.colors.secondaryLabel }}>Connect to a Computer to see AI quota usage.</Text> : null}
        <InlineError message={overviewQuery.error instanceof Error ? overviewQuery.error.message : actionError} />
        {activeId === ALL
          ? providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)
          : selected
            ? <ProviderCard expanded provider={selected} />
            : null}
      </UsageScroll>
      <ExpoDrawer
        contentPaddingBottom={0}
        contentPaddingHorizontal={0}
        fillBackground
        isPresented={settingsOpen}
        matchContents={false}
        onDismiss={() => setSettingsOpen(false)}
        snapPoints={[{ fraction: 0.72 }]}
      >
        <ScrollView
          contentContainerStyle={[styles.settingsContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
          style={[styles.settingsScroll, { backgroundColor: theme.colors.sheetBackground, height: settingsHeight }]}
          showsVerticalScrollIndicator
        >
          <InlineError message={actionError} />
          <Text style={[styles.section, { color: theme.colors.secondaryLabel }]}>Providers</Text>
          <View style={[styles.settingsRow, { borderColor: theme.colors.separator }]}>
            <Text numberOfLines={1} style={{ color: theme.colors.label, flex: 1, fontSize: 17 }}>All providers</Text>
            <View style={styles.settingsTrailing}>
              <View style={styles.settingsControl}>
                <NativeSwitch
                  onValueChange={(enabled) => toggleAll.mutate(enabled)}
                  value={providers.length > 0 && providers.every((provider) => provider.switch_enabled)}
                />
              </View>
            </View>
          </View>
          {providers.map((provider) => (
            <View key={provider.id} style={[styles.settingsRow, { borderColor: theme.colors.separator }]}>
              <ProviderGlyph color={theme.colors.label} providerId={provider.id} size={22} />
              <Text numberOfLines={1} style={{ color: theme.colors.label, flex: 1, fontSize: 17 }}>{provider.label}</Text>
              <View style={styles.settingsTrailing}>
                <View style={styles.settingsControl}>
                  <NativeSwitch
                    onValueChange={(enabled) => toggleOne.mutate({ enabled, providerId: provider.id })}
                    value={provider.switch_enabled}
                  />
                </View>
              </View>
            </View>
          ))}
          <View style={{ paddingHorizontal: 20 }}>
            <MenuPickerRow
              label="Refresh"
              onValueChange={(value) => autoRefresh.mutate(value === "off" ? null : Number(value))}
              options={REFRESH_OPTIONS}
              selectedValue={overview?.auto_refresh.interval_minutes?.toString() ?? "off"}
            />
          </View>
        </ScrollView>
      </ExpoDrawer>
    </>
  );
}

function actionMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Failed to update";
  if (message.startsWith("WebSocket request timeout")) return "Request timed out";
  return message;
}

function ProviderFilter({
  label,
  onSelect,
  providers,
}: {
  label: string;
  onSelect: (id: string) => void;
  providers: QuotaProviderResponse[];
}) {
  const theme = useMobileTheme();
  const choices = [{ id: ALL, label: "All" }, ...providers.map((provider) => ({ id: provider.id, label: provider.label }))];
  const menuWidth = 260;
  const menuHeight = 320;
  return (
    <IosPopover background="glass" direction="none">
      <IosPopover.Trigger>
        <View accessibilityLabel="Provider" accessibilityRole="button" style={styles.filterButton}>
          <View style={styles.filterChevrons}>
            <ChevronUpIcon color={theme.colors.label} size={11} strokeWidth={2.4} />
            <ChevronDownIcon color={theme.colors.label} size={11} strokeWidth={2.4} />
          </View>
          <Text numberOfLines={1} style={{ color: theme.colors.label, fontSize: 17, fontWeight: "600" }}>{label}</Text>
        </View>
      </IosPopover.Trigger>
      <IosPopover.Content
        style={{
          backgroundColor: theme.colors.cardElevated,
          height: menuHeight,
          left: 0,
          position: "absolute",
          top: 0,
          width: menuWidth,
        }}
      >
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator
          style={{ height: menuHeight, width: menuWidth }}
        >
          <View style={[styles.filterList, { width: menuWidth }]}>
            {choices.map((choice) => (
              <IosPopover.Pressable
                dismissOnPress
                key={choice.id}
                onPress={() => onSelect(choice.id)}
                style={styles.filterRow}
              >
                <ProviderGlyph color={theme.colors.label} providerId={choice.id} size={18} />
                <Text numberOfLines={1} style={{ color: theme.colors.label, fontSize: 17 }}>{choice.label}</Text>
              </IosPopover.Pressable>
            ))}
          </View>
        </ScrollView>
      </IosPopover.Content>
    </IosPopover>
  );
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
        <Text style={{ color: theme.colors.label, fontVariant: ["tabular-nums"], fontWeight: "700" }}>
          {provider.enabled && metric?.percent != null ? `${Math.round(metric.percent)}%` : ""}
        </Text>
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
                      <Text ellipsizeMode="tail" numberOfLines={1} style={{ color: theme.colors.label, flex: 1, fontSize: 13 }}>
                        {row.label}{row.percent != null ? ` · ${Math.round(row.percent)}% used` : ""}
                      </Text>
                      {row.resetText ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{row.resetText}</Text> : null}
                      {row.percent == null && row.value ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{row.value}</Text> : null}
                    </View>
                    {amount ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{amount}</Text> : null}
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
        <Text ellipsizeMode="tail" numberOfLines={1} style={{ color: theme.colors.label, flex: 1, fontSize: 13 }}>
          {row.label} · {row.usedText}
        </Text>
        {row.resetText ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{row.resetText}</Text> : null}
      </View>
      {row.detailText ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{row.detailText}</Text> : null}
      {row.percent != null ? <UsageTrack percent={row.percent} segments={row.segments} /> : null}
      {row.segments.length > 0 ? (
        <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>
          {row.segments.map((segment) => `${segment.label} ${Math.round(segment.percent)}%`).join(" · ")}
        </Text>
      ) : null}
    </View>
  );
}

function UsageTrack({ percent, segments = [] }: { percent: number; segments?: UsageSegment[] }) {
  const theme = useMobileTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.colors.cardSubtle }]}>
      {segments.length > 0 ? segments.map((segment, index) => (
        <View
          key={segment.label}
          style={{
            backgroundColor: theme.colors.label,
            height: "100%",
            opacity: 1 - index * 0.28,
            width: `${Math.min(100, Math.max(0, segment.percent))}%`,
          }}
        />
      )) : (
        <View style={{ backgroundColor: theme.colors.label, height: "100%", width: `${Math.min(100, Math.max(0, percent))}%` }} />
      )}
    </View>
  );
}

type UsageSegment = UsageRow["segments"][number];

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 12 },
  chevron: { alignItems: "center", height: 16, justifyContent: "center", width: 16 },
  filterButton: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  filterChevrons: { alignItems: "center", height: 22, justifyContent: "center" },
  filterList: { paddingVertical: 6 },
  filterRow: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 44, paddingHorizontal: 14 },
  metricLine: { alignItems: "center", flexDirection: "row", gap: 12 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  section: { fontSize: 13, fontWeight: "600", paddingHorizontal: 20, paddingTop: 8 },
  settingsContent: { flexGrow: 1 },
  settingsControl: { alignItems: "flex-end", justifyContent: "center" },
  settingsTrailing: { alignItems: "flex-end", alignSelf: "center", justifyContent: "center" },
  settingsRow: {
    alignItems: "center",
    alignSelf: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 20,
  },
  settingsScroll: { alignSelf: "stretch", flex: 1 },
  track: { borderRadius: 999, flexDirection: "row", height: 6, overflow: "hidden" },
});
