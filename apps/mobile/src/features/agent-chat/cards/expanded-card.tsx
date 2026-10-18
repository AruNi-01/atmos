import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { ShieldIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { COMPOSER_GLASS_WELL } from "../composer-glass";
import { useReducedMotion } from "../motion/use-reduced-motion";

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** Same gap for card blocks and chip wrap rows (web dock `gap-2` / 8pt). */
export const CARD_GAP = 8;
export const CARD_CHIP_GAP = 8;
export const CARD_ICON_SIZE = 16;
export const CARD_TITLE = { fontSize: 16, fontWeight: "700" as const, lineHeight: 21 };
export const CARD_BODY = { fontSize: 14, lineHeight: 20 };
export const CARD_MONO = { fontFamily: "Menlo", fontSize: 13, lineHeight: 18 };
/** Web `text-sky-500` on AgentSessionOpCard. */
export const SESSION_OP_SKY = "#0ea5e9";

type CardHeaderIcon = typeof ShieldIcon;

export function CardHeader({
  count,
  icon: Icon,
  iconColor,
  title,
  titleColor,
}: {
  count?: string | number | null;
  icon: CardHeaderIcon;
  iconColor?: string;
  title: string;
  titleColor?: string;
}) {
  const theme = useMobileTheme();
  const ink = iconColor ?? theme.colors.label;
  const titleInk = titleColor ?? theme.colors.label;
  const countText = count == null ? "" : String(count);
  return (
    <View style={styles.header}>
      <Icon color={ink} size={CARD_ICON_SIZE} strokeWidth={2} />
      <Text
        numberOfLines={1}
        style={{
          color: titleInk,
          flexGrow: 1,
          flexShrink: 1,
          fontSize: CARD_TITLE.fontSize,
          fontWeight: CARD_TITLE.fontWeight,
          lineHeight: CARD_TITLE.lineHeight,
        }}
      >
        {title}
      </Text>
      {countText.length > 0 ? (
        <Text
          style={{
            color: theme.colors.secondaryLabel,
            fontSize: CARD_BODY.fontSize,
            lineHeight: CARD_BODY.lineHeight,
          }}
        >
          {countText}
        </Text>
      ) : null}
    </View>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function CardStatusBadge({ label }: { label: string }) {
  const theme = useMobileTheme();
  return (
    <Text
      style={{
        backgroundColor: theme.colors.cardSubtle,
        borderRadius: 6,
        color: theme.colors.label,
        fontSize: CARD_BODY.fontSize,
        lineHeight: CARD_BODY.lineHeight,
        overflow: "hidden",
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      {label}
    </Text>
  );
}

export function CardBulletRow({ text }: { text: string }) {
  const theme = useMobileTheme();
  const body = { color: theme.colors.secondaryLabel, ...CARD_BODY };
  return (
    <View style={styles.bulletRow}>
      <Text style={body}>{"\u2022"}</Text>
      <Text selectable style={[body, { flex: 1 }]}>
        {text}
      </Text>
    </View>
  );
}

export function ExpandedCard({
  children,
  onHeight,
}: {
  children: ReactNode;
  onHeight: (height: number) => void;
}) {
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const maxHeight = Math.round(height * 0.4);
  const duration = reduced ? 0 : 180;
  const motion = { duration, easing: EASE_OUT };

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration).easing(motion.easing)}
      exiting={FadeOut.duration(motion.duration).easing(motion.easing)}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={{ marginHorizontal: 18, maxHeight }}
    >
      <GlassPanel
        {...COMPOSER_GLASS_WELL}
        interactive={false}
        style={{ borderRadius: radii.card, maxHeight }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          style={{ flexGrow: 0, maxHeight }}
        >
          <View style={styles.body}>{children}</View>
        </ScrollView>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: CARD_GAP,
  },
  bulletRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    paddingLeft: 12,
  },
  chipRow: {
    columnGap: CARD_CHIP_GAP,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: CARD_CHIP_GAP,
  },
  content: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
});
