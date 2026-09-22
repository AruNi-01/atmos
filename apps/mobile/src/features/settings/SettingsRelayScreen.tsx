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

export function SettingsRelayScreen() {
  const theme = useMobileTheme();
  const settings = useMobileSettingsController();
  const canSave = settings.canSaveRelaySettings && !settings.saveRelaySettings.isPending;
  const saveStyle = expoUiPrimaryStyle(theme.colors, !canSave);

  return (
    <AppScreen surface="sheet">
      <View className="gap-5">
        <FieldBlock label="Relay URL">
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              settings.setRelayDraft(value);
              settings.setError(null);
            }}
            placeholder="https://relay.atmos.land"
            value={settings.relayDraft}
          />
        </FieldBlock>

        <FieldBlock label="Secret key">
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              settings.setRelaySecretDraft(value);
              settings.setError(null);
            }}
            placeholder="Self-hosted only"
            secureTextEntry
            value={settings.relaySecretDraft}
          />
        </FieldBlock>

        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.colorScheme}
          seedColor={saveStyle.seedColor}
          style={expoUiButtonHostStyle}
        >
          <Button
            disabled={!canSave}
            label={
              settings.saveRelaySettings.isPending
                ? "Saving..."
                : settings.relayConfigured
                  ? "Saved"
                  : "Save"
            }
            modifiers={buttonStretchModifiers}
            onPress={canSave ? () => settings.saveRelaySettings.mutate() : undefined}
            style={saveStyle.style}
            variant={saveStyle.variant}
          />
        </Host>

        <InlineError message={settings.error} />
      </View>
    </AppScreen>
  );
}

/** List of Computers only — refresh via pull or single quiet action. */
