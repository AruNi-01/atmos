import type { ReactNode } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { AppScreen, InlineError, Section } from "@/ui/layout/app-screen";
import { Separator } from "@/ui/layout/row";
import { ProviderGlyph } from "@/ui/icons/provider-glyph";
import { MenuPicker } from "@/ui/primitives/menu-picker";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { useQuotaOverview } from "@/features/quota-usage/use-quota-overview";

const REFRESH_OPTIONS = [
  { label: "Off", value: "off" },
  { label: "1 min", value: "1" },
  { label: "5 min", value: "5" },
  { label: "15 min", value: "15" },
  { label: "30 min", value: "30" },
  { label: "1 hour", value: "60" },
];

export function QuotaSettingsScreen() {
  const theme = useMobileTheme();
  const { actionError, autoRefresh, overview, overviewQuery, providers, toggleAll, toggleOne } = useQuotaOverview({
    fetch: false,
  });
  const allOn = providers.length > 0 && providers.every((provider) => provider.switch_enabled);
  const errorMessage = overviewQuery.error instanceof Error ? overviewQuery.error.message : actionError;

  return (
    <AppScreen surface="sheet">
      <InlineError message={errorMessage} />
      <Section label="Providers">
        <QuotaSwitchRow
          onValueChange={(enabled) => toggleAll.mutate(enabled)}
          title="All providers"
          value={allOn}
        />
        {providers.map((provider) => (
          <View key={provider.id}>
            <Separator />
            <QuotaSwitchRow
              leading={<ProviderGlyph color={theme.colors.label} providerId={provider.id} size={22} />}
              onValueChange={(enabled) => toggleOne.mutate({ enabled, providerId: provider.id })}
              title={provider.label}
              value={provider.switch_enabled}
            />
          </View>
        ))}
      </Section>
      <Section>
        <View style={styles.row}>
          <Text numberOfLines={1} style={[typography.rowTitle, styles.label, { color: theme.colors.label }]}>
            Refresh
          </Text>
          <View style={styles.trailing}>
            <MenuPicker
              onValueChange={(value) => autoRefresh.mutate(value === "off" ? null : Number(value))}
              options={REFRESH_OPTIONS}
              selectedValue={overview?.auto_refresh.interval_minutes?.toString() ?? "off"}
            />
          </View>
        </View>
      </Section>
    </AppScreen>
  );
}

function QuotaSwitchRow({
  leading,
  onValueChange,
  title,
  value,
}: {
  leading?: ReactNode;
  onValueChange: (value: boolean) => void;
  title: string;
  value: boolean;
}) {
  const theme = useMobileTheme();

  return (
    <View style={styles.row}>
      {leading}
      <Text numberOfLines={1} style={[typography.rowTitle, styles.label, { color: theme.colors.label }]}>
        {title}
      </Text>
      <QuotaSwitch onValueChange={onValueChange} value={value} />
    </View>
  );
}

function QuotaSwitch({
  onValueChange,
  value,
}: {
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    // RN Switch forces alignSelf "flex-start", which pins it to the top of the row.
    <View style={styles.switchSlot}>
      <Switch onValueChange={onValueChange} trackColor={{ true: "#34C759" }} value={value} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { flex: 1 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.rowTitleGap,
    minHeight: spacing.rowMinHeight,
    paddingHorizontal: spacing.rowX,
    paddingVertical: spacing.rowY,
  },
  switchSlot: { alignSelf: "center", justifyContent: "center" },
  trailing: { alignItems: "center", alignSelf: "center", justifyContent: "center" },
});
