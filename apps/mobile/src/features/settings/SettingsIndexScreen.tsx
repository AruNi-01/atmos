import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ComputerOnlineCount } from "@/features/settings/ComputerOnlineCount";
import { formatComputerOnlineCount } from "@/features/settings/computer-settings";
import { useHubProfile } from "@/features/settings/use-hub-profile";
import { useMobileSettingsController } from "@/features/settings/use-mobile-settings-controller";
import {
  SettingsIconWell,
  SettingsListRow,
  SettingsProfileRow,
  shortRelayHost,
} from "@/features/settings/settings-shared";
import { typography } from "@/theme/typography";
import {
  themePreferenceOptions,
  useMobileTheme,
  type MobileThemePreference,
} from "@/theme/theme-store";
import { AppScreen, InlineError, Section } from "@/ui/layout/app-screen";
import { Separator } from "@/ui/layout/row";
import { LaptopIcon, LinkIcon, QrCodeIcon, SunMoonIcon } from "@/ui/icons/lucide-native";
import { NativeSegmentedControl } from "@/ui/primitives/native-controls";

export function SettingsIndexScreen() {
  const router = useRouter();
  const theme = useMobileTheme();
  const settings = useMobileSettingsController();
  const profile = useHubProfile(settings.hasDeviceCredential);
  const onlineCount = settings.activeComputers.filter((computer) => computer.online).length;
  const computerCount = formatComputerOnlineCount(onlineCount, settings.activeComputers.length);

  const openSignIn = () => {
    router.dismissTo("/");
    router.push("/sign-in");
  };

  const openRepair = () => {
    router.dismissTo("/");
    router.push({ pathname: "/sign-in", params: { mode: "scan" } });
  };

  return (
    <AppScreen surface="sheet">
      <Section>
        <SettingsProfileRow
          imageUrl={profile.data?.image}
          name={profile.data?.name}
          onPress={
            settings.hasDeviceCredential ? () => router.push("/settings/account") : openSignIn
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
          meta={
            computerCount.kind === "ratio" ? (
              <ComputerOnlineCount online={computerCount.online} total={computerCount.total} />
            ) : undefined
          }
          title="My Computers"
          value={computerCount.kind === "empty" ? computerCount.label : undefined}
          onPress={() => router.push("/settings/computers")}
        />
        <Separator />
        <SettingsListRow Icon={QrCodeIcon} title="Re-pair phone" onPress={openRepair} />
      </Section>

      <Section label="Preferences">
        <View style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <SettingsIconWell Icon={SunMoonIcon} />
            <Text style={[typography.rowTitle, { color: theme.colors.label, flex: 1 }]}>Theme</Text>
          </View>
          <NativeSegmentedControl<MobileThemePreference>
            onValueChange={theme.setPreference}
            options={themePreferenceOptions}
            selectedValue={theme.preference}
          />
        </View>
      </Section>

      <InlineError message={settings.error} />
    </AppScreen>
  );
}
