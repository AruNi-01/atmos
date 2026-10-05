import { useMemo, type ReactNode, type Ref } from "react";
import { RefreshControl, View, type ScrollView as Scroller } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";
import { useHomeTabBarInset } from "@/ui/layout/home-tab-bar-inset";

export function UsageScroll({
  children,
  contentRef,
  onOffset,
  onRefresh,
  refreshing = false,
  scrollRef,
  shift,
}: {
  children: ReactNode;
  /** Full page content, including parts scrolled out of view. Header buttons stay outside this view. */
  contentRef?: Ref<View>;
  onOffset?: (y: number) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  scrollRef?: Ref<Scroller>;
  /** Visual slide during a screenshot. Does not change scroll layout or offset. */
  shift?: SharedValue<number>;
}) {
  const theme = useMobileTheme();
  const tabBarInset = useHomeTabBarInset();
  const tint = theme.colors.secondaryLabel;
  const refreshControl = useMemo(
    () =>
      onRefresh ? (
        <RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor={tint} />
      ) : undefined,
    [onRefresh, refreshing, tint],
  );
  const shiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: shift === undefined ? 0 : shift.get() }],
  }));
  const body = (
    <View
      collapsable={false}
      ref={contentRef}
      style={{
        backgroundColor: theme.colors.background,
        gap: 16,
        paddingBottom: Math.max(spacing.screenBottom, tabBarInset + 12),
        paddingHorizontal: spacing.screenX,
        paddingTop: 8,
      }}
    >
      {children}
    </View>
  );
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      onScroll={onOffset ? (event) => onOffset(event.nativeEvent.contentOffset.y) : undefined}
      ref={scrollRef}
      refreshControl={refreshControl}
      scrollEventThrottle={onOffset ? 16 : undefined}
      style={{ backgroundColor: theme.colors.background, flex: 1 }}
    >
      {shift ? <Animated.View style={shiftStyle}>{body}</Animated.View> : body}
    </ScrollView>
  );
}
