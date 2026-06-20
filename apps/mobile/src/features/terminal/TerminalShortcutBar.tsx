import { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type KeyboardEvent,
  type KeyboardEventName,
} from "react-native";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { terminalShortcuts, type TerminalShortcut } from "@/features/terminal/terminal-shortcuts";
import { colors } from "@/theme/colors";

type KeyboardAccessoryState = {
  bottom: number;
  visible: boolean;
};

export function TerminalShortcutBar({
  onShortcut,
}: {
  onShortcut: (shortcut: TerminalShortcut) => void;
}) {
  const containerRef = useRef<View>(null);
  const [keyboardState, setKeyboardState] = useState<KeyboardAccessoryState>({
    bottom: 0,
    visible: false,
  });
  const shortcutsById = useMemo(() => new Map(terminalShortcuts.map((shortcut) => [shortcut.id, shortcut])), []);

  useEffect(() => {
    const showEvent: KeyboardEventName = process.env.EXPO_OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const changeEvent: KeyboardEventName = process.env.EXPO_OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent: KeyboardEventName = process.env.EXPO_OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      updateKeyboardPosition(containerRef.current, event, setKeyboardState);
    };
    const hide = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardState((state) => ({ ...state, visible: false }));
    };

    const subscriptions = Array.from(new Set([showEvent, changeEvent])).map((eventName) =>
      Keyboard.addListener(eventName, show),
    );
    subscriptions.push(Keyboard.addListener(hideEvent, hide));

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  const fireShortcut = (shortcutId: string) => {
    const shortcut = shortcutsById.get(shortcutId);
    if (shortcut) onShortcut(shortcut);
  };

  const handleMenuAction = (actionId: string) => fireShortcut(actionId);

  return (
    <View ref={containerRef} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {keyboardState.visible ? (
        <View pointerEvents="box-none" style={[styles.accessoryFrame, { bottom: keyboardState.bottom }]}>
          <GlassPanel
            fallbackStyle={styles.fallback}
            glassEffectStyle={{ style: "regular", animate: true }}
            interactive
            style={styles.root}
            tintColor="rgba(9, 9, 11, 0.78)"
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
              <ShortcutButton label="Keyboard" onPress={() => Keyboard.dismiss()} />
            </ScrollView>
          </GlassPanel>
        </View>
      ) : null}
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
  if (!onPress) {
    return (
      <View accessibilityRole="button" style={styles.keycap}>
        <Text style={styles.keycapText}>{label}</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.keycap, pressed && styles.keycapPressed]}
    >
      <Text style={styles.keycapText}>{label}</Text>
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

function updateKeyboardPosition(
  container: View | null,
  event: KeyboardEvent,
  setKeyboardState: (state: KeyboardAccessoryState) => void,
) {
  const fallbackBottom = Math.max(8, event.endCoordinates.height + 8);

  if (!container) {
    setKeyboardState({ bottom: fallbackBottom, visible: true });
    return;
  }

  requestAnimationFrame(() => {
    container.measureInWindow((_x, y, _width, height) => {
      const containerBottom = y + height;
      const keyboardTop = event.endCoordinates.screenY;
      const bottom = Math.max(8, containerBottom - keyboardTop + 8);
      setKeyboardState({
        bottom: Number.isFinite(bottom) ? bottom : fallbackBottom,
        visible: true,
      });
    });
  });
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
  accessoryFrame: {
    left: 10,
    position: "absolute",
    right: 10,
    zIndex: 20,
  },
  root: {
    backgroundColor: colors.terminalBg,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 30,
  },
  content: {
    alignItems: "center",
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  fallback: {
    backgroundColor: "rgba(9, 9, 11, 0.92)",
  },
  keycap: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderCurve: "continuous",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 54,
    paddingHorizontal: 13,
  },
  keycapPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  keycapText: {
    color: colors.terminalFg,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
  },
});
