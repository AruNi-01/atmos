import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useMobileTheme } from "@/theme/theme-store";
import { chatMutedForeground } from "./chat-ink";
import { useReducedMotion } from "./motion/use-reduced-motion";
import { TOOL_ADDITION_COLOR } from "./tool-body";

/** Web `MessageCopyButton`: `size-6` hit target, `size-3.5` glyph, `rounded-md`. */
export const COPY_BUTTON_PX = 24;
export const COPY_ICON_PX = 14;
export const COPY_BUTTON_RADIUS = 8;
/** Web holds the green check for 1200ms, then eases the glyph back in. */
export const COPY_FEEDBACK_MS = 1200;
const COPY_SWAP_MS = 180;
const COPY_SWAP_EASE = Easing.bezier(0, 0, 0.58, 1);

export function CopyMessageButton({ label, text }: { label: string; text: string }) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const skipEnter = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (skipEnter.current) {
      skipEnter.current = false;
      return;
    }
    if (reduced) {
      opacity.set(1);
      scale.set(1);
      return;
    }
    opacity.set(0);
    scale.set(0.85);
    opacity.set(withTiming(1, { duration: COPY_SWAP_MS, easing: COPY_SWAP_EASE }));
    scale.set(withTiming(1, { duration: COPY_SWAP_MS, easing: COPY_SWAP_EASE }));
  }, [copied, opacity, reduced, scale]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  const onPress = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void Clipboard.setStringAsync(trimmed).catch(() => {});
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.button}
    >
      <Animated.View style={iconStyle}>
        {copied ? (
          <Check color={TOOL_ADDITION_COLOR} size={COPY_ICON_PX} />
        ) : (
          <Copy color={chatMutedForeground(theme.isDark)} size={COPY_ICON_PX} />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: COPY_BUTTON_RADIUS,
    height: COPY_BUTTON_PX,
    justifyContent: "center",
    width: COPY_BUTTON_PX,
  },
});
