import { useEffect, useState, type PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import type { GlassViewProps } from "expo-glass-effect";
import { colors, radii, type MobileThemeColorScheme } from "@/theme/colors";
import { shadows } from "@/theme/shadows";
import { useMobileTheme } from "@/theme/theme-store";
import { shouldUseLiquidGlass } from "./glass-availability";

type GlassPanelProps = PropsWithChildren<{
  colorScheme?: MobileThemeColorScheme;
  fallbackStyle?: StyleProp<ViewStyle>;
  glassEffectStyle?: GlassViewProps["glassEffectStyle"];
  interactive?: boolean;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
}>;

export function GlassPanel({
  children,
  colorScheme,
  fallbackStyle,
  glassEffectStyle = "regular",
  interactive,
  shadow = true,
  style,
  tintColor,
}: GlassPanelProps) {
  const theme = useMobileTheme();
  const reduceTransparency = useReduceTransparencyEnabled();
  const resolvedScheme = colorScheme ?? theme.colorScheme;
  const isDark = resolvedScheme === "dark";
  const useLiquidGlass = shouldUseLiquidGlass({
    apiAvailable: isGlassEffectAPIAvailable(),
    liquidGlassAvailable: isLiquidGlassAvailable(),
    reduceTransparency,
  });
  const resolvedTintColor = tintColor ?? theme.colors.glassTint;
  const panelStyle = [styles.panel, { borderColor: theme.colors.glassBorder }, style];

  if (useLiquidGlass) {
    return (
      <GlassView
        colorScheme={resolvedScheme}
        glassEffectStyle={glassEffectStyle}
        isInteractive={interactive}
        style={[shadow ? (isDark ? styles.darkShadow : styles.lightShadow) : null, panelStyle]}
        tintColor={resolvedTintColor}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        shadow ? (isDark ? styles.darkShadow : styles.lightShadow) : null,
        { backgroundColor: theme.colors.glassFallback },
        fallbackStyle,
        panelStyle,
      ]}
    >
      {children}
    </View>
  );
}

function useReduceTransparencyEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = AccessibilityInfo.isReduceTransparencyEnabled;
    if (typeof read !== "function") return undefined;
    void read()
      .then((value) => {
        if (alive) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setEnabled,
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

const styles = StyleSheet.create({
  darkShadow: {
    boxShadow: shadows.glassPanelDark,
  },
  fallback: {
    backgroundColor: colors.glassFallback,
  },
  lightShadow: {
    boxShadow: shadows.glassPanelLight,
  },
  panel: {
    borderColor: colors.glassBorder,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
