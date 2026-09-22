import { Image, Text, View } from "react-native";
import { useHubProfile } from "@/features/settings/use-hub-profile";
import { useMobileSettingsController } from "@/features/settings/use-mobile-settings-controller";
import { SettingsListRow } from "@/features/settings/settings-shared";
import { useMobileTheme } from "@/theme/theme-store";
import { AppScreen, InlineError, Section } from "@/ui/layout/app-screen";
import { LogOutIcon, UserIcon } from "@/ui/icons/lucide-native";

const AVATAR_SIZE = 96;

export function SettingsAccountScreen() {
  const theme = useMobileTheme();
  const settings = useMobileSettingsController();
  const profile = useHubProfile(settings.hasDeviceCredential);
  const name = profile.data?.name?.trim() || "Account";
  const imageUrl = profile.data?.image;

  return (
    <AppScreen surface="sheet">
      <View style={{ alignItems: "center", gap: 16, paddingTop: 28, paddingBottom: 8 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: theme.colors.cardSubtle,
            borderRadius: AVATAR_SIZE / 2,
            height: AVATAR_SIZE,
            justifyContent: "center",
            overflow: "hidden",
            width: AVATAR_SIZE,
          }}
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={{ height: AVATAR_SIZE, width: AVATAR_SIZE }} />
          ) : (
            <UserIcon color={theme.colors.label} size={40} strokeWidth={2.2} />
          )}
        </View>
        <Text
          style={{
            color: theme.colors.label,
            fontSize: 22,
            fontWeight: "700",
            letterSpacing: -0.4,
            textAlign: "center",
          }}
        >
          {name}
        </Text>
      </View>

      <Section>
        <SettingsListRow
          Icon={LogOutIcon}
          destructive
          title={settings.signOutPhone.isPending ? "Signing out..." : "Sign out"}
          onPress={
            settings.signOutPhone.isPending ? undefined : settings.confirmSignOutPhone
          }
        />
      </Section>

      <InlineError
        message={
          profile.error instanceof Error ? profile.error.message : settings.error
        }
      />
    </AppScreen>
  );
}
