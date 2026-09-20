import { View } from "react-native";
import { useSignOutPhone } from "@/features/onboarding/use-sign-out-phone";
import { useSessionStore } from "@/stores/session-store";
import {
  themePreferenceOptions,
  useMobileTheme,
  type MobileThemePreference,
} from "@/theme/theme-store";
import { UserIcon } from "@/ui/icons/lucide-native";
import { IosPopover } from "@/ui/primitives/ios-popover";
import {
  PopoverActionList,
  PopoverActionRow,
  PopoverMenuSeparator,
} from "@/ui/primitives/popover-menu";

export function AccountPopoverButton() {
  const theme = useMobileTheme();
  const hasDeviceCredential = useSessionStore((state) => state.hasDeviceCredential);
  const signOut = useSignOutPhone();

  return (
    <IosPopover direction="bottom">
      <IosPopover.Trigger>
        <View
          accessibilityLabel="Account"
          accessibilityRole="button"
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <UserIcon color={theme.colors.label} size={22} strokeWidth={2.4} />
        </View>
      </IosPopover.Trigger>
      <IosPopover.Content style={{ backgroundColor: theme.colors.cardElevated }}>
        <PopoverActionList>
          {themePreferenceOptions.map((option) => (
            <PopoverActionRow
              key={option.value}
              label={option.label}
              onPress={() => theme.setPreference(option.value as MobileThemePreference)}
              selected={theme.preference === option.value}
            />
          ))}
          {hasDeviceCredential ? (
            <>
              <PopoverMenuSeparator />
              <PopoverActionRow
                destructive
                label={signOut.isPending ? "Signing out..." : "Sign out"}
                onPress={signOut.confirmSignOutPhone}
              />
            </>
          ) : null}
        </PopoverActionList>
      </IosPopover.Content>
    </IosPopover>
  );
}
