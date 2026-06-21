import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { TerminalKeyboardDismissButton } from "@/features/terminal/TerminalKeyboardDismissButton";
import { terminalShortcuts, type TerminalShortcut } from "@/features/terminal/terminal-shortcuts";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

export function TerminalShortcutBar({
  enabled = true,
  onDismissKeyboard,
  onShortcut,
}: {
  enabled?: boolean;
  onDismissKeyboard?: () => void;
  onShortcut: (shortcut: TerminalShortcut) => void;
}) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const shortcutsById = useMemo(() => new Map(terminalShortcuts.map((shortcut) => [shortcut.id, shortcut])), []);
  const bottomPadding = keyboardVisible ? 4 : Math.max(insets.bottom, 4);

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

  const fireShortcut = (shortcutId: string) => {
    const shortcut = shortcutsById.get(shortcutId);
    if (shortcut) onShortcut(shortcut);
  };

  const handleMenuAction = (actionId: string) => fireShortcut(actionId);

  if (!enabled) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.terminalBg, paddingBottom: bottomPadding }]}>
      <View style={styles.row}>
        <GlassPanel
          fallbackStyle={[styles.fallback, { backgroundColor: theme.isDark ? "rgba(9, 9, 11, 0.92)" : "rgba(255, 255, 255, 0.72)" }]}
          glassEffectStyle={{ style: "regular", animate: true }}
          interactive
          style={[styles.root, { backgroundColor: theme.colors.terminalBg, borderColor: theme.colors.glassBorder }]}
          tintColor={theme.isDark ? "rgba(9, 9, 11, 0.78)" : "rgba(255, 255, 255, 0.58)"}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
            <ShortcutMenuButton
              actions={CTRL_ACTIONS}
              label="Ctrl"
              onAction={handleMenuAction}
            />
            <ShortcutButton label="Esc" onPress={() => fireShortcut("esc")} />
            <ShortcutButton label="Tab" onPress={() => fireShortcut("tab")} />
            <ShortcutButton label="Paste" onPress={() => fireShortcut("paste")} />
            <ShortcutButton label="History" onPress={() => fireShortcut("up")} />
            <ShortcutMenuButton
              actions={DIRECTION_ACTIONS}
              label="Move"
              onAction={handleMenuAction}
              openOnLongPress
            />
            <ShortcutMenuButton
              actions={AGENT_ACTIONS}
              label="Agent"
              onAction={handleMenuAction}
            />
          </ScrollView>
        </GlassPanel>
        {keyboardVisible && onDismissKeyboard ? (
          <TerminalKeyboardDismissButton onPress={onDismissKeyboard} />
        ) : null}
      </View>
    </View>
  );
}

function ShortcutButton({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  const theme = useMobileTheme();
  const keycapStyle = {
    backgroundColor: theme.isDark ? "rgba(248, 250, 252, 0.10)" : "rgba(244, 244, 245, 0.93)",
    borderColor: theme.isDark ? theme.colors.glassBorder : theme.colors.separator,
  };
  const keycapPressedStyle = {
    backgroundColor: theme.isDark ? "rgba(248, 250, 252, 0.16)" : "rgba(228, 228, 231, 0.96)",
  };
  const keycapTextStyle = {
    color: theme.isDark ? theme.colors.label : "#111827",
  };

  if (!onPress) {
    return (
      <View accessibilityRole="button" style={[styles.keycap, keycapStyle]}>
        <Text style={[styles.keycapText, keycapTextStyle]}>{label}</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.keycap, keycapStyle, pressed && keycapPressedStyle]}
    >
      <Text style={[styles.keycapText, keycapTextStyle]}>{label}</Text>
    </Pressable>
  );
}

function ShortcutMenuButton({
  actions,
  defaultActionId,
  label,
  onAction,
  openOnLongPress,
}: {
  actions: MenuAction[];
  defaultActionId?: string;
  label: string;
  onAction: (actionId: string) => void;
  openOnLongPress?: boolean;
}) {
  return (
    <MenuView
      actions={actions}
      onPressAction={(event) => onAction(event.nativeEvent.event)}
      shouldOpenOnLongPress={openOnLongPress}
    >
      <ShortcutButton label={label} onPress={defaultActionId ? () => onAction(defaultActionId) : undefined} />
    </MenuView>
  );
}

const CTRL_ACTIONS: MenuAction[] = [
  { id: "ctrl-c", title: "Ctrl-C" },
  { id: "ctrl-d", title: "Ctrl-D" },
  { id: "ctrl-l", title: "Ctrl-L" },
  { id: "ctrl-a", title: "Ctrl-A" },
  { id: "ctrl-e", title: "Ctrl-E" },
];

const DIRECTION_ACTIONS: MenuAction[] = [
  { id: "up", title: "Up" },
  { id: "down", title: "Down" },
  { id: "left", title: "Left" },
  { id: "right", title: "Right" },
];

const AGENT_ACTIONS: MenuAction[] = [
  { id: "agent-continue", title: "Continue" },
  { id: "agent-yes", title: "Yes" },
  { id: "agent-no", title: "No" },
  { id: "new-terminal", title: "New Terminal" },
  { id: "switch-terminal", title: "Switch Terminal" },
];

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.terminalBg,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  root: {
    backgroundColor: colors.terminalBg,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 23,
    flex: 1,
    minWidth: 0,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  content: {
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fallback: {
    backgroundColor: "rgba(9, 9, 11, 0.92)",
  },
  keycap: {
    alignItems: "center",
    backgroundColor: "rgba(244, 244, 245, 0.93)",
    borderColor: colors.separator,
    borderCurve: "continuous",
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 46,
    paddingHorizontal: 10,
  },
  keycapText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
  },
});
