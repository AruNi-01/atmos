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

export function SettingsRegisterScreen() {
  const theme = useMobileTheme();
  const settings = useMobileSettingsController();
  const disabled =
    !settings.hasDeviceCredential || settings.createRegisterCommand.isPending;
  const createStyle = expoUiPrimaryStyle(theme.colors, disabled);

  return (
    <AppScreen surface="sheet">
      <View className="gap-5">
        {!settings.hasDeviceCredential ? (
          <EmptyState
            title="Sign in required"
            message="Pair this phone before creating a register command."
          />
        ) : (
          <Host
            matchContents={{ vertical: true }}
            colorScheme={theme.colorScheme}
            seedColor={createStyle.seedColor}
            style={expoUiButtonHostStyle}
          >
            <Button
              disabled={disabled}
              label={
                settings.createRegisterCommand.isPending
                  ? "Creating..."
                  : "Create command"
              }
              modifiers={buttonStretchModifiers}
              onPress={
                disabled ? undefined : () => settings.createRegisterCommand.mutate()
              }
              style={createStyle.style}
              variant={createStyle.variant}
            />
          </Host>
        )}

        {settings.registerCommand ? (
          <View
            className="gap-2.5 overflow-hidden p-3.5"
            style={{
              backgroundColor: theme.colors.terminalBg,
              borderCurve: "continuous",
              borderRadius: radii.cardNested,
            }}
          >
            <Text
              selectable
              className="font-mono text-terminal-fg text-mono-code leading-mono-code"
            >
              {settings.registerCommand}
            </Text>
          </View>
        ) : null}

        <InlineError message={settings.error} />
      </View>
    </AppScreen>
  );
}

