import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import type { GlassViewProps } from "expo-glass-effect";
import { colors, radii } from "@/theme/colors";
import { shadows } from "@/theme/shadows";
import { useMobileTheme } from "@/theme/theme-store";

type GlassPanelProps = PropsWithChildren<{
  fallbackStyle?: StyleProp<ViewStyle>;
  glassEffectStyle?: GlassViewProps["glassEffectStyle"];
  interactive?: boolean;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
}>;

export function GlassPanel({
  children,
  fallbackStyle,
  glassEffectStyle = "regular",
  interactive,
  shadow = true,
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
        style={[shadow ? (theme.isDark ? styles.darkShadow : styles.lightShadow) : null, panelStyle]}
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
        shadow ? (theme.isDark ? styles.darkShadow : styles.lightShadow) : null,
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
