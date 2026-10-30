import { useWindowDimensions } from "react-native";
import {
  GlassNavigationTabBar,
  GlassScreenBackdrop,
  type GlassNavigationTabBarProps,
} from "@rbayuokt/expo-adaptive-glass/navigation";
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
 * The library pins the pill to `safeArea.bottom + 8`, which leaves a dead band
 * under it. Sit it just above the screen edge so the list can show through.
 */
const GLASS_TAB_BAR_BOTTOM = 12;
/** Icon, label, and the pill's own padding. */
const GLASS_TAB_BAR_BODY = 64;
/** Lets the last row scroll clear of the overlay without shortening the page. */
const GLASS_TAB_SCROLL_CLEARANCE = GLASS_TAB_BAR_BOTTOM + GLASS_TAB_BAR_BODY + 8;
/**
 * GlassTabBar gives every tab flex:1 and the lens fills that slot.
 * Two labels stretched across the screen sit in the middle of a huge slot, so a
 * drag slides the words toward the finger. A slot about as wide as the longer
 * label keeps the text planted and lets the lens travel between them.
 */
const GLASS_TAB_SLOT = 104;
const GLASS_TAB_COUNT = 4;

function tintString(color: unknown, fallback: string): string {
  return typeof color === "string" ? color : fallback;
}

/**
 * SDK 56 bottom-tabs types tint colors as ColorValue. The glass bar only
 * accepts strings, and it only reads these fields.
 */
type TabBarProps = {
  descriptors: Record<
    string,
    {
      options: {
        title?: string;
        tabBarAccessibilityLabel?: string;
        tabBarActiveTintColor?: unknown;
        tabBarBadge?: string | number;
        tabBarButtonTestID?: string;
        tabBarIcon?: GlassNavigationTabBarProps["descriptors"][string]["options"]["tabBarIcon"];
        tabBarInactiveTintColor?: unknown;
        tabBarLabel?: GlassNavigationTabBarProps["descriptors"][string]["options"]["tabBarLabel"];
        tabBarShowLabel?: boolean;
      };
    }
  >;
  insets: GlassNavigationTabBarProps["insets"];
  navigation: GlassNavigationTabBarProps["navigation"];
  state: {
    index: number;
    routes: { key: string; name: string; params?: object }[];
  };
};

function glassTabBarProps(
  props: TabBarProps,
  active: string,
  inactive: string,
): GlassNavigationTabBarProps {
  const descriptors: GlassNavigationTabBarProps["descriptors"] = {};
  for (const [key, descriptor] of Object.entries(props.descriptors)) {
    const options = descriptor.options;
    const label = options.tabBarLabel;
    descriptors[key] = {
      options: {
        title: options.title,
        tabBarLabel: typeof label === "string" || typeof label === "function" ? label : undefined,
        tabBarIcon: options.tabBarIcon,
        tabBarBadge: options.tabBarBadge,
        tabBarShowLabel: options.tabBarShowLabel,
        tabBarActiveTintColor: tintString(options.tabBarActiveTintColor, active),
        tabBarInactiveTintColor: tintString(options.tabBarInactiveTintColor, inactive),
        tabBarAccessibilityLabel: options.tabBarAccessibilityLabel,
        tabBarButtonTestID: options.tabBarButtonTestID,
      },
    };
  }
  return {
    descriptors,
    insets: props.insets,
    navigation: props.navigation,
    state: props.state,
  };
}

export function AndroidHomeTabs() {
  const { width: windowWidth } = useWindowDimensions();
  const theme = useMobileTheme();
  const barWidth = Math.min(GLASS_TAB_SLOT * GLASS_TAB_COUNT, windowWidth - 32);
  const barSide = Math.max(16, Math.round((windowWidth - barWidth) / 2));

  return (
    <HomeTabBarInsetContext.Provider value={GLASS_TAB_SCROLL_CLEARANCE}>
      <Tabs
        screenLayout={({ children }) => <GlassScreenBackdrop>{children}</GlassScreenBackdrop>}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.colors.background },
          tabBarActiveTintColor: theme.colors.label,
          tabBarInactiveTintColor: theme.colors.secondaryLabel,
        }}
        tabBar={(props) => (
          <GlassNavigationTabBar
            {...glassTabBarProps(props, theme.colors.label, theme.colors.secondaryLabel)}
            intensity={1}
            style={{ bottom: GLASS_TAB_BAR_BOTTOM, left: barSide, right: barSide }}
          />
        )}
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
