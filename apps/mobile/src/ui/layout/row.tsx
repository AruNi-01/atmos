import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { spacing } from "@/theme/spacing";
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
    <View
      style={{
        gap: spacing.rowGap,
        minHeight: spacing.rowMinHeight,
        paddingHorizontal: spacing.rowX,
        paddingVertical: spacing.rowY,
      }}
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: spacing.rowTitleGap,
          justifyContent: "space-between",
        }}
      >
        <Text
          numberOfLines={2}
          style={[
            typography.rowTitle,
            { color: theme.colors.label, flex: 1, fontWeight: "600" },
          ]}
        >
          {title}
        </Text>
        {children}
        {onPress && !children ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              color: theme.colors.tertiaryLabel,
              fontSize: 22,
              lineHeight: 24,
              marginLeft: -4,
            }}
          >
            ›
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text
          numberOfLines={1}
          style={[
            typography.rowMeta,
            { color: theme.colors.secondaryLabel, fontVariant: ["tabular-nums"] },
          ]}
        >
          {meta}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          numberOfLines={2}
          style={[typography.rowSubtitle, { color: theme.colors.secondaryLabel }]}
        >
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
  const theme = useMobileTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.separator,
        height: StyleSheet.hairlineWidth,
        marginLeft: spacing.separatorInset,
      }}
    />
  );
}
