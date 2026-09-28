import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import type { QuotaOverviewResponse, QuotaProviderResponse } from "@atmos/api-types/ws/dto/quota";
import { wsActions } from "@/api/ws-actions";
import { UsageScroll } from "@/features/usage/usage-scroll";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronDownIcon, SettingsIcon } from "@/ui/icons/lucide-native";
import { ProviderGlyph } from "@/ui/icons/provider-glyph";
import { InlineError } from "@/ui/layout/app-screen";
import { settingsHeaderItem } from "@/ui/navigation/home-header-items";
import { nativeLargeTitleOptions } from "@/ui/navigation/native-screen-options";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { MenuPickerRow } from "@/ui/primitives/menu-picker";
import { NativeMenuButton } from "@/ui/primitives/native-menu-button";
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
    onSuccess: write,
    onError: (error: unknown) => setActionError(error instanceof Error ? error.message : "Failed to update provider switch"),
  });
  const toggleAll = useMutation({
    mutationFn: (enabled: boolean) => wsActions.quotaSetAllProvidersSwitch(client!, enabled),
    onSuccess: write,
  });
  const autoRefresh = useMutation({
    mutationFn: (minutes: number | null) => wsActions.quotaSetAutoRefresh(client!, minutes),
    onSuccess: write,
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
          headerLeft: () => (
            <NativeMenuButton
              actions={[
                { id: ALL, title: "All", state: activeId === ALL ? "on" : "off" },
                ...providers.map((provider) => ({
                  id: provider.id,
                  title: provider.label,
                  state: provider.id === activeId ? ("on" as const) : ("off" as const),
                })),
              ]}
              label={currentLabel}
              onAction={setSelectedId}
              systemImage="chevron.up.chevron.down"
            />
          ),
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
      <ExpoDrawer isPresented={settingsOpen} onDismiss={() => setSettingsOpen(false)}>
        <Text style={[styles.section, { color: theme.colors.label }]}>Providers</Text>
        <View style={styles.row}>
          <Text style={{ color: theme.colors.label, flex: 1, fontWeight: "600" }}>All providers</Text>
          <NativeSwitch
            disabled={toggleAll.isPending}
            onValueChange={(enabled) => toggleAll.mutate(enabled)}
            value={providers.length > 0 && providers.every((provider) => provider.switch_enabled)}
          />
        </View>
        {providers.map((provider) => (
          <View key={provider.id} style={styles.row}>
            <ProviderGlyph color={theme.colors.label} providerId={provider.id} size={18} />
            <Text numberOfLines={1} style={{ color: theme.colors.label, flex: 1 }}>{provider.label}</Text>
            <NativeSwitch
              disabled={toggleOne.isPending}
              onValueChange={(enabled) => toggleOne.mutate({ enabled, providerId: provider.id })}
              value={provider.switch_enabled}
            />
          </View>
        ))}
        <MenuPickerRow
          label="Refresh"
          onValueChange={(value) => autoRefresh.mutate(value === "off" ? null : Number(value))}
          options={REFRESH_OPTIONS}
          selectedValue={overview?.auto_refresh.interval_minutes?.toString() ?? "off"}
        />
      </ExpoDrawer>
    </>
  );
}

function ProviderCard({ expanded = false, provider }: { expanded?: boolean; provider: QuotaProviderResponse }) {
  const theme = useMobileTheme();
  const [open, setOpen] = useState(expanded);
  const metric = primaryMetric(provider);
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.separator }]}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.row}>
        <ProviderGlyph color={theme.colors.label} providerId={provider.id} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.label, fontWeight: "700" }}>{provider.label}</Text>
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{provider.enabled ? (metric?.label ?? "Usage") : "Not detected"}</Text>
        </View>
        <Text style={{ color: theme.colors.label, fontVariant: ["tabular-nums"], fontWeight: "700" }}>
          {provider.enabled && metric?.percent != null ? `${Math.round(metric.percent)}%` : ""}
        </Text>
        <ChevronDownIcon color={theme.colors.tertiaryLabel} size={16} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ gap: 10 }}>
          {metrics(provider).map((row) => (
            <View key={row.label} style={{ gap: 6 }}>
              <Text style={{ color: theme.colors.label, fontSize: 13 }}>{row.label}{row.percent != null ? ` · ${Math.round(row.percent)}% used` : ""}</Text>
              {row.percent != null ? (
                <View style={[styles.track, { backgroundColor: theme.colors.cardSubtle }]}>
                  <View style={{ backgroundColor: theme.colors.label, height: "100%", width: `${Math.min(100, row.percent)}%` }} />
                </View>
              ) : null}
            </View>
          ))}
          {metrics(provider).length === 0 ? <Text style={{ color: theme.colors.secondaryLabel }}>No usage data</Text> : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function metrics(provider: QuotaProviderResponse) {
  const rows: Array<{ label: string; percent: number | null }> = [];
  for (const section of provider.detail_sections) {
    const title = section.title.toLowerCase();
    if (!["usage", "standard", "droid core", "core"].includes(title)) continue;
    for (const row of section.rows) {
      if (!row.value?.trim() || row.label.toLowerCase() === "billing period") continue;
      const match = row.value.match(/(\d+(?:\.\d+)?)%\s*used/i);
      rows.push({ label: row.label, percent: match ? Number(match[1]) : null });
    }
  }
  return rows;
}

function primaryMetric(provider: QuotaProviderResponse) {
  return metrics(provider)[0] ?? null;
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 12 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  section: { fontSize: 16, fontWeight: "700" },
  track: { borderRadius: 999, height: 6, overflow: "hidden" },
});
