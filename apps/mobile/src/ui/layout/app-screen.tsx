import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useUiStore } from "@/stores/ui-store";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "@/ui/primitives/glass-panel";

type AppScreenProps = PropsWithChildren<{
  footer?: ReactNode;
  surface?: "screen" | "sheet";
}>;

export function AppScreen({ children, footer, surface = "screen" }: AppScreenProps) {
  const theme = useMobileTheme();
  const disconnectedReason = useUiStore((state) => state.disconnectedReason);
  const backgroundColor = surface === "sheet" ? theme.colors.sheetBackground : theme.colors.background;

  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={[styles.scroll, { backgroundColor }]}
        contentContainerStyle={[
          styles.scrollContent,
          { backgroundColor },
          footer ? styles.scrollContentWithFooter : null,
        ]}
      >
        <View style={styles.content}>
          {disconnectedReason ? <ConnectionBanner message={disconnectedReason} /> : null}
          {children}
        </View>
      </ScrollView>
      {footer ? (
        <GlassPanel
          fallbackStyle={[styles.footerFallback, { backgroundColor: theme.colors.glassFallbackStrong }]}
          glassEffectStyle={{ style: "regular", animate: true }}
          shadow={false}
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.glassFallbackStrong,
              borderTopColor: theme.colors.glassBorder,
            },
          ]}
          tintColor={theme.colors.glassTint}
        >
          {footer}
        </GlassPanel>
      ) : null}
    </>
  );
}

function ConnectionBanner({ message }: { message: string }) {
  const theme = useMobileTheme();

  return (
    <View
      style={[
        styles.connectionBanner,
        { backgroundColor: theme.colors.redSurface, borderColor: theme.colors.redBorder },
      ]}
    >
      <Text selectable style={[styles.connectionTitle, { color: theme.colors.label }]}>
        Disconnected
      </Text>
      <Text selectable style={[styles.connectionMessage, { color: theme.colors.secondaryLabel }]}>
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
  const theme = useMobileTheme();

  return (
    <View style={styles.section}>
      {label ? <Text style={[styles.sectionLabel, { color: theme.colors.secondaryLabel }]}>{label}</Text> : null}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.cardElevated,
            borderColor: theme.colors.glassBorder,
          },
        ]}
      >
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
  const theme = useMobileTheme();

  return (
    <View style={styles.empty}>
      <Text selectable style={[styles.emptyTitle, { color: theme.colors.label }]}>
        {title}
      </Text>
      <Text selectable style={[styles.emptyMessage, { color: theme.colors.secondaryLabel }]}>
        {message}
      </Text>
    </View>
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  const theme = useMobileTheme();

  if (!message) return null;

  return (
    <View style={[styles.error, { backgroundColor: theme.colors.redSurface, borderColor: theme.colors.redBorder }]}>
      <Text selectable style={[styles.errorText, { color: theme.colors.red }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: 20,
    padding: 18,
    paddingBottom: 36,
  },
  scrollContent: {
    backgroundColor: colors.background,
  },
  scrollContentWithFooter: {
    paddingBottom: 8,
  },
  footer: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
    borderTopColor: colors.glassBorder,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
  },
  footerFallback: {
    backgroundColor: colors.glassFallbackStrong,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.cardElevated,
    borderColor: colors.glassBorder,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 1,
    overflow: "hidden",
  },
  connectionBanner: {
    backgroundColor: colors.redSurface,
    borderColor: colors.redBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    gap: 4,
    padding: 12,
  },
  connectionMessage: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
  },
  connectionTitle: {
    color: colors.red,
    fontSize: 13,
    fontWeight: "700",
  },
  empty: {
    alignItems: "center",
    gap: 8,
    padding: 24,
  },
  emptyTitle: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyMessage: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  error: {
    backgroundColor: colors.redSurface,
    borderColor: colors.redBorder,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
  },
});
