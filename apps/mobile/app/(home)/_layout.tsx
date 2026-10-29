import { View } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { AuthConnectContent } from "@/features/onboarding/AuthConnectContent";
import { useSessionStore } from "@/stores/session-store";
import { useMobileTheme } from "@/theme/theme-store";
import { AtmosLogo } from "@/ui/AtmosLogo";
import { navigationBarTint } from "@/ui/navigation/home-header-items";
import { HomeTabBarInsetContext } from "@/ui/layout/home-tab-bar-inset";
import { AndroidHomeTabs } from "./android-home-tabs";

export const unstable_settings = {
  initialRouteName: "(workspace)",
};

/**
 * Icon-only system tab bar. It floats over the page, so lists scroll
 * underneath and each icon is the hit target. System insets already clear
 * the last row.
 *
 * iOS 26 NativeTabs already draws system Liquid Glass. `backgroundColor` /
 * `blurEffect` are ignored, and there is no public API for
 * `UIGlassEffect.Style.clear`, so this keeps the system default.
 */
function IosHomeTabs() {
  const theme = useMobileTheme();
  // The app theme is JS-only. iOS 26 otherwise draws this floating bar in the
  // system style, so a dark page gets a light gray glass pill. A static
  // near-white tint does the same to the selection glow.
  const tabScreenNativeProps = {
    ios: { experimental_userInterfaceStyle: theme.colorScheme },
  };

  return (
    <HomeTabBarInsetContext.Provider value={0}>
      <NativeTabs
        iconColor={{
          default: theme.colors.secondaryLabel,
          selected: theme.colors.label,
        }}
        minimizeBehavior="never"
        tintColor={navigationBarTint(theme.colors.label)}
        unstable_nativeProps={{ colorScheme: theme.colorScheme }}
      >
        <NativeTabs.Trigger name="(workspace)" unstable_nativeProps={tabScreenNativeProps}>
          <NativeTabs.Trigger.Icon sf="square.grid.2x2" />
          <NativeTabs.Trigger.Label hidden>Workspace</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="session" unstable_nativeProps={tabScreenNativeProps}>
          <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right" />
          <NativeTabs.Trigger.Label hidden>Session</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="token-usage" unstable_nativeProps={tabScreenNativeProps}>
          <NativeTabs.Trigger.Icon sf="chart.bar" />
          <NativeTabs.Trigger.Label hidden>Tokens</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="quota-usage" unstable_nativeProps={tabScreenNativeProps}>
          <NativeTabs.Trigger.Icon sf="gauge.with.dots.needle.67percent" />
          <NativeTabs.Trigger.Label hidden>Quota</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </HomeTabBarInsetContext.Provider>
  );
}

/**
 * Login and QR pair both store a device credential. Until one of those
 * succeeds, tab switches have nothing to open, so the home route is the
 * connect screen instead of the tab navigator.
 */
function UnconnectedComputerScreen({ ready }: { ready: boolean }) {
  const theme = useMobileTheme();

  if (!ready) {
    return (
      <View
        accessibilityRole="progressbar"
        style={{
          alignItems: "center",
          backgroundColor: theme.colors.background,
          flex: 1,
          justifyContent: "center",
        }}
      >
        <AtmosLogo breathe />
      </View>
    );
  }

  return <AuthConnectContent presentation="screen" />;
}

export default function HomeTabsLayout() {
  const deviceCredentialLoaded = useSessionStore((state) => state.deviceCredentialLoaded);
  const hasDeviceCredential = useSessionStore((state) => state.hasDeviceCredential);

  if (!deviceCredentialLoaded || !hasDeviceCredential) {
    return <UnconnectedComputerScreen ready={deviceCredentialLoaded} />;
  }
  if (process.env.EXPO_OS === "ios") return <IosHomeTabs />;
  return <AndroidHomeTabs />;
}
