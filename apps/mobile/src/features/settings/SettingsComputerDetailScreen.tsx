import { Button, Host } from "@expo/ui";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { ComputerRow } from "@/api/types";
import { useMobileSettingsController } from "@/features/settings/use-mobile-settings-controller";
import {
  FieldBlock,
  SettingsIconWell,
  SettingsListRow,
  SettingsProfileRow,
  ComputerListRow,
  ComputerStatusIndicator,
  shortRelayHost,
} from "@/features/settings/settings-shared";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import {
  themePreferenceOptions,
  useMobileTheme,
  type MobileThemePreference,
} from "@/theme/theme-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";
import {
  ChevronRightIcon,
  LaptopIcon,
  LinkIcon,
  LogOutIcon,
  PlusCircleIcon,
  SunMoonIcon,
  UserIcon,
} from "@/ui/icons/lucide-native";
import { NativeSegmentedControl, NativeTextInput } from "@/ui/primitives/native-controls";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import {
  expoUiButtonHostStyle,
  expoUiPrimaryStyle,
  expoUiSecondaryStyle,
} from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

export function SettingsComputerDetailScreen() {
  const theme = useMobileTheme();
  const params = useLocalSearchParams<{ serverId?: string }>();
  const settings = useMobileSettingsController();
  const serverId = typeof params.serverId === "string" ? params.serverId : null;
  const computer =
    settings.activeComputers.find((row) => row.server_id === serverId) ??
    settings.selectedComputer;
  const renameDisabled =
    !serverId ||
    settings.rename.isPending ||
    !settings.renameValue.trim();
  const renameStyle = expoUiPrimaryStyle(theme.colors, renameDisabled);

  useEffect(() => {
    if (!serverId) return;
    const row = settings.activeComputers.find((c) => c.server_id === serverId);
    if (row && settings.selectedServerId !== serverId) {
      settings.focusComputer(row);
    }
  }, [serverId, settings.activeComputers, settings.focusComputer, settings.selectedServerId]);

  useEffect(() => {
    if (computer) {
      settings.setRenameValue(computer.display_name ?? "");
    }
    // Prefill once per computer open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computer?.server_id]);

  if (!computer) {
    return (
      <AppScreen surface="sheet">
        <EmptyState title="Computer not found" message="Go back and pick a Computer." />
      </AppScreen>
    );
  }

  return (
    <AppScreen surface="sheet">
      <View className="gap-5">
        <FieldBlock label="Name">
          <NativeTextInput
            onChangeText={settings.setRenameValue}
            placeholder="Computer name"
            value={settings.renameValue}
          />
        </FieldBlock>

        <Text className="px-1 text-secondary-label" style={typography.rowSubtitle}>
          {computer.server_id}
        </Text>

        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.colorScheme}
          seedColor={renameStyle.seedColor}
          style={expoUiButtonHostStyle}
        >
          <Button
            disabled={renameDisabled}
            label={settings.rename.isPending ? "Saving..." : "Save name"}
            modifiers={buttonStretchModifiers}
            onPress={renameDisabled ? undefined : () => settings.rename.mutate()}
            style={renameStyle.style}
            variant={renameStyle.variant}
          />
        </Host>

        <Section>
          <Pressable
            accessibilityRole="button"
            disabled={settings.revoke.isPending}
            onPress={settings.confirmRevokeSelectedComputer}
            style={({ pressed }) =>
              pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
            }
          >
            <View className="min-h-row-min-height items-center justify-center px-row-x py-row-y">
              <Text style={[typography.rowTitle, { color: theme.colors.red }]}>
                {settings.revoke.isPending ? "Revoking..." : "Revoke Computer"}
              </Text>
            </View>
          </Pressable>
        </Section>

        <InlineError message={settings.error} />
      </View>
    </AppScreen>
  );
}

/** Register: one action + optional command block. */
