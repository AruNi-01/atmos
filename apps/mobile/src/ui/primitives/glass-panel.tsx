import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import type { GlassViewProps } from "expo-glass-effect";
import { colors, radii } from "@/theme/colors";

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
  tintColor = colors.glassTint,
}: GlassPanelProps) {
  const shouldUseLiquidGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const panelStyle = [styles.panel, style];

  if (shouldUseLiquidGlass) {
    return (
      <GlassView
        colorScheme="light"
        glassEffectStyle={glassEffectStyle}
        isInteractive={interactive}
        style={panelStyle}
        tintColor={tintColor}
      >
        {children}
      </GlassView>
    );
  }

  return <View style={[styles.fallback, fallbackStyle, panelStyle]}>{children}</View>;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.glassFallback,
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
