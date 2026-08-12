import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";

export function Row({
  title,
  subtitle,
  meta,
  onPress,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const theme = useMobileTheme();
  const content = (
    <View className="min-h-row-min-height gap-row-gap px-row-x py-row-y">
      <View className="flex-row items-center justify-between gap-row-title-gap">
        <Text className="flex-1 font-semibold text-label" numberOfLines={2} style={typography.rowTitle}>
          {title}
        </Text>
        {children}
        {onPress && !children ? (
          <Text
            className="-ml-1 text-[22px] leading-6 text-tertiary-label"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            ›
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text className="text-secondary-label tabular-nums" numberOfLines={1} style={typography.rowMeta}>
          {meta}
        </Text>
      ) : null}
      {subtitle ? (
        <Text className="text-secondary-label" numberOfLines={2} style={typography.rowSubtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed: isPressed }) =>
        isPressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
      }
    >
      {content}
    </Pressable>
  );
}

export function Separator() {
  return <View className="ml-separator-inset h-px bg-separator" />;
}
