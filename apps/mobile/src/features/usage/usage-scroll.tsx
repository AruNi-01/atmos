import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";
import { useHomeTabBarInset } from "@/ui/layout/home-tab-bar-inset";

export function UsageScroll({
  children,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const theme = useMobileTheme();
  const tabBarInset = useHomeTabBarInset();
  return (
    <ScrollView
      contentContainerStyle={{
        gap: 16,
        paddingBottom: Math.max(spacing.screenBottom, tabBarInset + 12),
        paddingHorizontal: spacing.screenX,
        paddingTop: 8,
      }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        onRefresh ? (
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor={theme.colors.secondaryLabel} />
        ) : undefined
      }
      style={{ backgroundColor: theme.colors.background, flex: 1 }}
    >
      {children}
    </ScrollView>
  );
}
