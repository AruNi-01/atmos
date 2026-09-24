import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { terminalShortcuts, type TerminalShortcut } from "@/features/terminal/terminal-shortcuts";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { KeyboardIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";

const BAR_SHORTCUTS = ["esc", "at", "slash", "tab", "shift-tab", "up", "down", "left", "right", "enter", "shift-enter"] as const;

const SHORTCUT_LABEL: Record<(typeof BAR_SHORTCUTS)[number], string> = {
  esc: "Esc",
  at: "@",
  slash: "/",
  tab: "Tab",
  "shift-tab": "⇧Tab",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  enter: "↵",
  "shift-enter": "⇧↵",
};

const SHORTCUT_ACCESSIBILITY: Record<(typeof BAR_SHORTCUTS)[number], string> = {
  esc: "Escape",
  at: "At",
  slash: "Slash",
  tab: "Tab",
  "shift-tab": "Shift Tab",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  enter: "Enter",
  "shift-enter": "Shift Enter",
};

const FADE_SIZE = 24;

export function TerminalShortcutBar({
  enabled = true,
  onShortcut,
  onToggleKeyboard,
}: {
  enabled?: boolean;
  onShortcut: (shortcut: TerminalShortcut) => void;
  onToggleKeyboard?: () => void;
}) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [edgeFade, setEdgeFade] = useState({ left: 0, right: 0 });
  const scrollMetricsRef = useRef({ contentWidth: 0, layoutWidth: 0, offsetX: 0 });
  const shortcutsById = useMemo(() => new Map(terminalShortcuts.map((shortcut) => [shortcut.id, shortcut])), []);
  const bottomPadding = keyboardVisible ? 6 : Math.max(insets.bottom, 8);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const updateEdgeFade = () => {
    const { contentWidth, layoutWidth, offsetX } = scrollMetricsRef.current;
    const left = Math.min(FADE_SIZE, Math.max(0, offsetX));
    const right = Math.min(FADE_SIZE, Math.max(0, contentWidth - layoutWidth - offsetX));
    setEdgeFade((current) => (current.left === left && current.right === right ? current : { left, right }));
  };

  if (!enabled) return null;

  const keycapStyle = {
    backgroundColor: theme.colors.terminalKeycap,
  };
  const keycapPressedStyle = {
    backgroundColor: theme.colors.terminalKeycapPressed,
  };
  const labelStyle = {
    color: theme.colors.terminalFg,
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.terminalBg, paddingBottom: bottomPadding }]}>
      <GlassPanel
        fallbackStyle={{ backgroundColor: theme.colors.terminalChromeFallback }}
        glassEffectStyle={{ style: "regular", animate: true }}
        interactive
        style={[
          styles.pill,
          {
            borderColor: theme.colors.glassBorder,
          },
        ]}
        tintColor={theme.colors.terminalChromeTint}
      >
        <View style={styles.row}>
          <View style={styles.scrollerWrap}>
            <ScrollView
              horizontal
              contentContainerStyle={styles.scrollerContent}
              onContentSizeChange={(contentWidth) => {
                scrollMetricsRef.current.contentWidth = contentWidth;
                updateEdgeFade();
              }}
              onLayout={(event) => {
                scrollMetricsRef.current.layoutWidth = event.nativeEvent.layout.width;
                updateEdgeFade();
              }}
              onScroll={(event) => {
                scrollMetricsRef.current.offsetX = event.nativeEvent.contentOffset.x;
                updateEdgeFade();
              }}
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={false}
              style={styles.scroller}
            >
            {BAR_SHORTCUTS.map((shortcutId) => {
              const shortcut = shortcutsById.get(shortcutId);
              if (!shortcut) return null;
              return (
                <Pressable
                  accessibilityLabel={SHORTCUT_ACCESSIBILITY[shortcutId]}
                  accessibilityRole="button"
                  key={shortcutId}
                  onPress={() => onShortcut(shortcut)}
                  style={({ pressed }) => [styles.keycap, keycapStyle, pressed && keycapPressedStyle]}
                >
                  <Text numberOfLines={1} style={[styles.keycapText, labelStyle]}>
                    {SHORTCUT_LABEL[shortcutId]}
                  </Text>
                </Pressable>
              );
            })}
            </ScrollView>
            {edgeFade.left > 0 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.fade,
                  styles.fadeLeft,
                  {
                    experimental_backgroundImage: "linear-gradient(to right, #09090b 0%, rgba(9, 9, 11, 0) 100%)",
                    width: edgeFade.left,
                  },
                ]}
              />
            ) : null}
            {edgeFade.right > 0 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.fade,
                  styles.fadeRight,
                  {
                    experimental_backgroundImage: "linear-gradient(to left, #09090b 0%, rgba(9, 9, 11, 0) 100%)",
                    width: edgeFade.right,
                  },
                ]}
              />
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={keyboardVisible ? "Hide keyboard" : "Show keyboard"}
            accessibilityRole="button"
            onPress={onToggleKeyboard}
            style={({ pressed }) => [styles.keycap, styles.keyboardKeycap, keycapStyle, pressed && keycapPressedStyle]}
          >
            <KeyboardIcon color={theme.colors.terminalFg} size={18} strokeWidth={2.2} />
          </Pressable>
        </View>
      </GlassPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  keycap: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.pill,
    flexShrink: 0,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 44,
    paddingHorizontal: 10,
  },
  fade: {
    bottom: 0,
    position: "absolute",
    top: 0,
  },
  fadeLeft: {
    left: 0,
  },
  fadeRight: {
    right: 0,
  },
  keyboardKeycap: {
    minWidth: 44,
  },
  keycapText: {
    ...typography.terminalKeycapLabel,
    textAlign: "center",
  },
  pill: {
    borderRadius: radii.terminalChrome,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingRight: 10,
    paddingVertical: 4,
  },
  scroller: {
    flex: 1,
    minWidth: 0,
  },
  scrollerContent: {
    alignItems: "center",
    gap: 4,
    paddingLeft: 10,
    paddingRight: 2,
  },
  scrollerWrap: {
    flex: 1,
    minWidth: 0,
  },
});
