import type { ReactNode, Ref } from "react";
import { RefreshControl, View, type ScrollView as Scroller } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
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
}: {
  children: ReactNode;
  /** Full page content, including parts scrolled out of view. Header buttons stay outside this view. */
  contentRef?: Ref<View>;
  onOffset?: (y: number) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  scrollRef?: Ref<Scroller>;
}) {
  const theme = useMobileTheme();
  const tabBarInset = useHomeTabBarInset();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      onScroll={onOffset ? (event) => onOffset(event.nativeEvent.contentOffset.y) : undefined}
      ref={scrollRef}
      refreshControl={
        onRefresh ? (
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor={theme.colors.secondaryLabel} />
        ) : undefined
      }
      scrollEventThrottle={onOffset ? 16 : undefined}
      style={{ backgroundColor: theme.colors.background, flex: 1 }}
    >
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
    </ScrollView>
  );
}
