import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { ComputerRow } from "@/api/types";
import { ComputerList } from "@/features/computers/ComputerPicker";
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
import { GlassActionButtons } from "@/ui/primitives/glass-action-buttons";
import { ListSkeleton } from "@/ui/primitives/list-skeleton";
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

export function SettingsComputersScreen() {
  const router = useRouter();
  const settings = useMobileSettingsController();

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

      {settings.computersQuery.isPending && settings.activeComputers.length === 0 ? (
        <Section>
          <ListSkeleton />
        </Section>
      ) : settings.activeComputers.length === 0 ? (
        <Section>
          <EmptyState
            layout="section"
            title="No Computers"
            message="No Computers yet."
          />
          {process.env.EXPO_OS !== "ios" ? (
            <View className="px-card-padding pb-card-padding">
              <GlassActionButtons
                actions={[
                  {
                    disabled: settings.computersQuery.isFetching,
                    label: settings.computersQuery.isFetching ? "Refreshing..." : "Refresh",
                    onPress: () => void settings.computersQuery.refetch(),
                  },
                ]}
              />
            </View>
          ) : null}
        </Section>
      ) : (
        <Section>
          <ComputerList
            computers={settings.activeComputers}
            onPress={(computer) => {
              if (computer.online) settings.selectComputer(computer);
              else settings.focusComputer(computer);
              router.push({
                pathname: "/settings/computer",
                params: { serverId: computer.server_id },
              });
            }}
            selectedServerId={settings.selectedServerId}
          />
        </Section>
      )}

      <InlineError message={settings.error} />
    </AppScreen>
  );
}

/** Single Computer: name field + destructive revoke row. */
