import { Button, Host } from "@expo/ui";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { ComputerRow } from "@/api/types";
import { PreviewModeSwitch } from "@/features/preview/PreviewModeSwitch";
import { useHubProfile } from "@/features/settings/use-hub-profile";
import { useMobileSettingsController } from "@/features/settings/use-mobile-settings-controller";
import {
  SettingsIconWell,
  SettingsListRow,
  SettingsProfileRow,
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
  LaptopIcon,
  LinkIcon,
  QrCodeIcon,
  SunMoonIcon,
} from "@/ui/icons/lucide-native";
import { NativeSegmentedControl, NativeTextInput } from "@/ui/primitives/native-controls";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import {
  expoUiButtonHostStyle,
  expoUiPrimaryStyle,
  expoUiSecondaryStyle,
} from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

export function SettingsIndexScreen() {
  const router = useRouter();
  const theme = useMobileTheme();
  const settings = useMobileSettingsController();
  const profile = useHubProfile(settings.hasDeviceCredential);
  const onlineCount = settings.activeComputers.filter((c) => c.online).length;
  const computersMeta =
    settings.activeComputers.length === 0
      ? "None"
      : `${settings.activeComputers.length}${onlineCount > 0 ? ` · ${onlineCount} online` : ""}`;

  const openSignIn = () => {
    router.dismissTo("/");
    router.push("/sign-in");
  };

  return (
    <AppScreen surface="sheet">
      <Section>
        <SettingsProfileRow
          imageUrl={profile.data?.image}
          name={profile.data?.name}
          onPress={
            settings.hasDeviceCredential
              ? () => router.push("/settings/account")
              : openSignIn
          }
          signedIn={settings.hasDeviceCredential}
        />
      </Section>

      <Section label="Computer">
        <SettingsListRow
          Icon={LinkIcon}
          title="Relay"
          value={shortRelayHost(settings.relayUrl)}
          onPress={() => router.push("/settings/relay")}
        />
        <Separator />
        <SettingsListRow
          Icon={LaptopIcon}
          title="My Computers"
          value={computersMeta}
          onPress={() => router.push("/settings/computers")}
        />
        <Separator />
        <SettingsListRow
          Icon={QrCodeIcon}
          title="Re-pair phone"
          onPress={openSignIn}
        />
      </Section>

      <Section label="Preferences">
        <View style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <SettingsIconWell Icon={SunMoonIcon} />
            <Text
              style={[
                typography.rowTitle,
                { color: theme.colors.label, flex: 1 },
              ]}
            >
              Theme
            </Text>
          </View>
          <NativeSegmentedControl<MobileThemePreference>
            onValueChange={theme.setPreference}
            options={themePreferenceOptions}
            selectedValue={theme.preference}
          />
        </View>
      </Section>

      <Section label="Developer">
        <PreviewModeSwitch />
      </Section>

      <InlineError message={settings.error} />
    </AppScreen>
  );
}

/** Sparse form: fields + one Save action (Grok form density). */
