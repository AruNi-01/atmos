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

export function SettingsComputersScreen() {
  const theme = useMobileTheme();
  const router = useRouter();
  const settings = useMobileSettingsController();
  const refreshStyle = expoUiSecondaryStyle(
    theme.colors,
    settings.computersQuery.isFetching,
  );

  return (
    <AppScreen surface="sheet">
      <Stack.Screen
        options={{
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "button" as const,
                    label: "Refresh",
                    icon: { type: "sfSymbol" as const, name: "arrow.clockwise" as const },
                    disabled: settings.computersQuery.isFetching,
                    onPress: () => void settings.computersQuery.refetch(),
                    accessibilityLabel: "Refresh Computers",
                    variant: "plain" as const,
                  },
                ],
              }
            : {
                headerRight: () => null,
              }),
        }}
      />

      {settings.activeComputers.length === 0 ? (
        <Section>
          <EmptyState
            layout="section"
            title="No Computers"
            message="Register a server, then refresh."
          />
          {process.env.EXPO_OS !== "ios" ? (
            <View className="px-card-padding pb-card-padding">
              <Host
                matchContents={{ vertical: true }}
                colorScheme={theme.colorScheme}
                seedColor={refreshStyle.seedColor}
                style={expoUiButtonHostStyle}
              >
                <Button
                  disabled={settings.computersQuery.isFetching}
                  label={
                    settings.computersQuery.isFetching ? "Refreshing..." : "Refresh"
                  }
                  modifiers={buttonStretchModifiers}
                  onPress={
                    settings.computersQuery.isFetching
                      ? undefined
                      : () => void settings.computersQuery.refetch()
                  }
                  style={refreshStyle.style}
                  variant={refreshStyle.variant}
                />
              </Host>
            </View>
          ) : null}
        </Section>
      ) : (
        <Section>
          {settings.activeComputers.map((computer, index) => (
            <View key={computer.server_id}>
              <ComputerListRow
                computer={computer}
                selectedServerId={settings.selectedServerId}
                onPress={() => {
                  settings.focusComputer(computer);
                  router.push({
                    pathname: "/settings/computer",
                    params: { serverId: computer.server_id },
                  });
                }}
              />
              {index < settings.activeComputers.length - 1 ? <Separator /> : null}
            </View>
          ))}
        </Section>
      )}

      <InlineError message={settings.error} />
    </AppScreen>
  );
}

/** Single Computer: name field + destructive revoke row. */
