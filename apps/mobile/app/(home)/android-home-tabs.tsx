import { Tabs } from "expo-router";
import { useMobileTheme } from "@/theme/theme-store";
import { HomeTabBarInsetContext } from "@/ui/layout/home-tab-bar-inset";
import {
  ChartColumnBigIcon,
  GaugeIcon,
  LayoutGridIcon,
  MessagesSquareIcon,
} from "@/ui/icons/lucide-native";

/**
 * iOS never mounts this (`NativeTabs` in `_layout`). Web keeps a standard tab
 * bar; adaptive-glass lives only in `android-home-tabs.android.tsx`.
 */
export function AndroidHomeTabs() {
  const theme = useMobileTheme();

  return (
    <HomeTabBarInsetContext.Provider value={0}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.colors.background },
          tabBarActiveTintColor: theme.colors.label,
          tabBarInactiveTintColor: theme.colors.secondaryLabel,
          tabBarStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Tabs.Screen
          name="(workspace)"
          options={{
            title: "Workspace",
            tabBarAccessibilityLabel: "Workspace",
            tabBarIcon: ({ color, size }) => <LayoutGridIcon color={color} size={size} />,
            tabBarShowLabel: false,
          }}
        />
        <Tabs.Screen
          name="session"
          options={{
            title: "Session",
            tabBarAccessibilityLabel: "Session",
            tabBarIcon: ({ color, size }) => <MessagesSquareIcon color={color} size={size} />,
            tabBarShowLabel: false,
          }}
        />
        <Tabs.Screen
          name="token-usage"
          options={{
            title: "Tokens",
            tabBarAccessibilityLabel: "Token usage",
            tabBarIcon: ({ color, size }) => <ChartColumnBigIcon color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="quota-usage"
          options={{
            title: "Quota",
            tabBarAccessibilityLabel: "Quota usage",
            tabBarIcon: ({ color, size }) => <GaugeIcon color={color} size={size} />,
          }}
        />
      </Tabs>
    </HomeTabBarInsetContext.Provider>
  );
}
