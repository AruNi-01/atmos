import { useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";

export function Row({
  leading,
  title,
  subtitle,
  subtitleNumberOfLines = 2,
  meta,
  onLongPress,
  onPress,
  showDisclosure,
  children,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  subtitleNumberOfLines?: number;
  meta?: string;
  onLongPress?: () => void;
  onPress?: () => void;
  /** Keeps the disclosure mark when a parent swipe row owns the press. */
  showDisclosure?: boolean;
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
        {leading}
        <Text
          numberOfLines={2}
          style={[typography.rowTitle, { color: theme.colors.label, flex: 1, fontWeight: "600" }]}
        >
          {title}
        </Text>
        {children}
        {(showDisclosure ?? Boolean(onPress && !children)) ? (
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
          numberOfLines={subtitleNumberOfLines}
          style={[
            typography.rowSubtitle,
            { color: theme.colors.secondaryLabel, paddingLeft: leading ? 28 : 0 },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <Pressable
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed: isPressed }) =>
        isPressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
      }
    >
      {content}
    </Pressable>
  );
}

export const SEPARATOR_THICKNESS = StyleSheet.hairlineWidth;

/** Keeps its height while fading, so hiding a divider does not change the row size. */
export function SwipeSeparator({ hidden }: { hidden: boolean }) {
  const reducedMotion = useReducedMotion() === true;
  const opacity = useSharedValue(hidden ? 0 : 1);

  useEffect(() => {
    opacity.set(withTiming(hidden ? 0 : 1, { duration: reducedMotion ? 0 : 240 }));
  }, [hidden, opacity, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Reanimated.View pointerEvents="none" style={style}>
      <Separator />
    </Reanimated.View>
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
