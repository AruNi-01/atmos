import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import type { GlassViewProps } from "expo-glass-effect";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

type GlassPanelProps = PropsWithChildren<{
  fallbackStyle?: StyleProp<ViewStyle>;
  glassEffectStyle?: GlassViewProps["glassEffectStyle"];
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
}>;

export function GlassPanel({
  children,
  fallbackStyle,
  glassEffectStyle = "regular",
  interactive,
  style,
  tintColor,
}: GlassPanelProps) {
  const theme = useMobileTheme();
  const shouldUseLiquidGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const resolvedTintColor = tintColor ?? theme.colors.glassTint;
  const panelStyle = [styles.panel, { borderColor: theme.colors.glassBorder }, style];

  if (shouldUseLiquidGlass) {
    return (
      <GlassView
        colorScheme={theme.colorScheme}
        glassEffectStyle={glassEffectStyle}
        isInteractive={interactive}
        style={[theme.isDark ? styles.darkShadow : styles.lightShadow, panelStyle]}
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
        theme.isDark ? styles.darkShadow : styles.lightShadow,
        { backgroundColor: theme.colors.glassFallback },
        fallbackStyle,
        panelStyle,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  darkShadow: {
    boxShadow: "0 14px 42px rgba(0, 0, 0, 0.24)",
  },
  fallback: {
    backgroundColor: colors.glassFallback,
  },
  lightShadow: {
    boxShadow: "0 14px 42px rgba(10, 10, 11, 0.07)",
  },
  panel: {
    borderColor: colors.glassBorder,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
