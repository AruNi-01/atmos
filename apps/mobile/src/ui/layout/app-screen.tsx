import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/ui-store";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "@/ui/primitives/glass-panel";

type AppScreenProps = PropsWithChildren<{
  footer?: ReactNode;
  surface?: "screen" | "sheet";
}>;

export function AppScreen({ children, footer, surface = "screen" }: AppScreenProps) {
  const theme = useMobileTheme();
  const disconnectedReason = useUiStore((state) => state.disconnectedReason);
  const backgroundClassName = surface === "sheet" ? "bg-sheet-background" : "bg-background";

  return (
    <>
      <ScrollView
        className={cn("flex-1", backgroundClassName)}
        contentContainerClassName={cn(
          backgroundClassName,
          "gap-section-gap px-screen-x pb-screen-bottom",
          footer ? "pb-2" : null,
        )}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-section-gap">
          {disconnectedReason ? <ConnectionBanner message={disconnectedReason} /> : null}
          {children}
        </View>
      </ScrollView>
      {footer ? (
        <GlassPanel
          fallbackStyle={{ backgroundColor: theme.colors.glassFallbackStrong }}
          glassEffectStyle={{ style: "regular", animate: true }}
          shadow={false}
          style={{
            backgroundColor: theme.colors.glassFallbackStrong,
            borderRadius: 0,
            borderBottomWidth: 0,
            borderLeftWidth: 0,
            borderRightWidth: 0,
            borderTopColor: theme.colors.glassBorder,
            borderTopWidth: StyleSheet.hairlineWidth,
            paddingBottom: spacing.screenFooterBottom,
            paddingHorizontal: spacing.screenX,
            paddingTop: spacing.screenFooterTop,
          }}
          tintColor={theme.colors.glassTint}
        >
          {footer}
        </GlassPanel>
      ) : null}
    </>
  );
}

function ConnectionBanner({ message }: { message: string }) {
  return (
    <View className="gap-1 rounded-card border border-red-border bg-red-surface p-3">
      <Text selectable className="text-[13px] font-bold text-label">
        Disconnected
      </Text>
      <Text selectable className="text-[13px] leading-[18px] text-secondary-label">
        {message}
      </Text>
    </View>
  );
}

export function Section({
  children,
  label,
}: PropsWithChildren<{
  label?: string;
}>) {
  return (
    <View className="gap-section-label-gap">
      {label ? (
        <Text
          className="px-section-label-x font-semibold text-secondary-label"
          style={typography.sectionLabel}
        >
          {label}
        </Text>
      ) : null}
      <View className="min-h-px overflow-hidden rounded-card border border-glass-border bg-card-elevated">
        {children}
      </View>
    </View>
  );
}

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View className="items-center gap-2 p-6">
      <Text selectable className="text-center font-bold text-label" style={typography.emptyTitle}>
        {title}
      </Text>
      <Text selectable className="text-center text-secondary-label" style={typography.emptyMessage}>
        {message}
      </Text>
    </View>
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;

  return (
    <View className="rounded-card border border-red-border bg-red-surface p-3">
      <Text selectable className="text-red" style={typography.body}>
        {message}
      </Text>
    </View>
  );
}
