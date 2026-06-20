import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { GlassContainer } from "expo-glass-effect";
import { useUiStore } from "@/stores/ui-store";
import { colors, radii } from "@/theme/colors";
import { GlassPanel } from "@/ui/primitives/glass-panel";

type AppScreenProps = PropsWithChildren<{
  footer?: ReactNode;
}>;

export function AppScreen({ children, footer }: AppScreenProps) {
  const disconnectedReason = useUiStore((state) => state.disconnectedReason);

  return (
    <GlassContainer spacing={10} style={styles.root}>
      <View pointerEvents="none" style={styles.backgroundWash} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {disconnectedReason ? <ConnectionBanner message={disconnectedReason} /> : null}
        {children}
      </ScrollView>
      {footer ? (
        <GlassPanel
          fallbackStyle={styles.footerFallback}
          glassEffectStyle={{ style: "regular", animate: true }}
          interactive
          style={styles.footer}
        >
          {footer}
        </GlassPanel>
      ) : null}
    </GlassContainer>
  );
}

function ConnectionBanner({ message }: { message: string }) {
  return (
    <GlassPanel fallbackStyle={styles.connectionFallback} glassEffectStyle="clear" style={styles.connectionBanner}>
      <Text selectable style={styles.connectionTitle}>
        Disconnected
      </Text>
      <Text selectable style={styles.connectionMessage}>
        {message}
      </Text>
    </GlassPanel>
  );
}

export function Section({
  children,
  label,
}: PropsWithChildren<{
  label?: string;
}>) {
  return (
    <View style={styles.section}>
      {label ? <Text style={styles.sectionLabel}>{label}</Text> : null}
      <GlassPanel
        fallbackStyle={styles.cardFallback}
        glassEffectStyle={{ style: "regular", animate: true }}
        interactive
        style={styles.card}
      >
        {children}
      </GlassPanel>
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
    <View style={styles.empty}>
      <Text selectable style={styles.emptyTitle}>
        {title}
      </Text>
      <Text selectable style={styles.emptyMessage}>
        {message}
      </Text>
    </View>
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;

  return (
    <GlassPanel fallbackStyle={styles.errorFallback} glassEffectStyle="clear" style={styles.error}>
      <Text selectable style={styles.errorText}>
        {message}
      </Text>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 18,
    padding: 16,
    paddingBottom: 36,
  },
  backgroundWash: {
    backgroundColor: "rgba(10, 10, 11, 0.018)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 96,
  },
  footer: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
    borderTopColor: colors.glassBorder,
    padding: 16,
  },
  section: {
    gap: 7,
  },
  sectionLabel: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 2,
    textTransform: "uppercase",
  },
  card: {
    minHeight: 1,
  },
  cardFallback: {
    backgroundColor: colors.glassFallback,
  },
  connectionBanner: {
    borderColor: colors.redBorder,
    borderRadius: radii.card,
    gap: 4,
    padding: 12,
  },
  connectionFallback: {
    backgroundColor: colors.redSurface,
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
    borderColor: colors.redBorder,
    borderRadius: radii.card,
    padding: 12,
  },
  errorFallback: {
    backgroundColor: colors.redSurface,
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
  },
  footerFallback: {
    backgroundColor: colors.glassFallbackStrong,
  },
});
