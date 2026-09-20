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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { IosPopover } from "@/ui/primitives/ios-popover";
import { PopoverActionList, PopoverActionRow } from "@/ui/primitives/popover-menu";
import { TerminalKeyboardDismissButton } from "@/features/terminal/TerminalKeyboardDismissButton";
import { terminalShortcuts, type TerminalShortcut } from "@/features/terminal/terminal-shortcuts";
import { radii } from "@/theme/radii";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
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

  if (!enabled) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.terminalBg,
          paddingBottom: bottomPadding,
          paddingHorizontal: spacing.terminalChromeX,
        },
      ]}
    >
      <View style={styles.row}>
        <GlassPanel
          fallbackStyle={[styles.fallback, { backgroundColor: theme.colors.terminalChromeFallback }]}
          glassEffectStyle={{ style: "regular", animate: true }}
          interactive
          style={[
            styles.root,
            {
              borderColor: theme.colors.glassBorder,
              borderRadius: radii.terminalChrome,
            },
          ]}
          tintColor={theme.colors.terminalChromeTint}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.content}
            style={styles.scroller}
          >
            <ShortcutPopoverButton actions={CTRL_ACTIONS} label="Ctrl" onAction={fireShortcut} />
            <ShortcutButton label="Esc" onPress={() => fireShortcut("esc")} />
            <ShortcutButton label="Tab" onPress={() => fireShortcut("tab")} />
            <ShortcutButton label="Paste" onPress={() => fireShortcut("paste")} />
            <ShortcutButton label="History" onPress={() => fireShortcut("up")} />
            <ShortcutPopoverButton
              actions={DIRECTION_ACTIONS}
              defaultActionId="up"
              label="Move"
              onAction={fireShortcut}
              openOnLongPress
            />
            <ShortcutPopoverButton actions={AGENT_ACTIONS} label="Agent" onAction={fireShortcut} />
            <View style={styles.trailingSpace} />
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
    backgroundColor: theme.colors.terminalKeycap,
    borderColor: theme.colors.glassBorder,
    borderRadius: radii.terminalKeycap,
  };
  const keycapPressedStyle = {
    backgroundColor: theme.colors.terminalKeycapPressed,
  };
  const keycapTextStyle = {
    color: theme.colors.terminalFg,
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

function ShortcutPopoverButton({
  actions,
  defaultActionId,
  label,
  onAction,
  openOnLongPress,
}: {
  actions: Array<{ id: string; title: string }>;
  defaultActionId?: string;
  label: string;
  onAction: (actionId: string) => void;
  openOnLongPress?: boolean;
}) {
  const theme = useMobileTheme();

  return (
    <IosPopover direction="top" trigger={openOnLongPress ? "longPress" : "tap"}>
      <IosPopover.Trigger>
        <ShortcutButton label={label} onPress={defaultActionId ? () => onAction(defaultActionId) : undefined} />
      </IosPopover.Trigger>
      <IosPopover.Content style={{ backgroundColor: theme.colors.terminalElevated }}>
        <PopoverActionList>
          {actions.map((action) => (
            <PopoverActionRow
              key={action.id}
              label={action.title}
              onPress={() => onAction(action.id)}
              tone="terminal"
            />
          ))}
        </PopoverActionList>
      </IosPopover.Content>
    </IosPopover>
  );
}

const CTRL_ACTIONS = [
  { id: "ctrl-c", title: "Ctrl-C" },
  { id: "ctrl-d", title: "Ctrl-D" },
  { id: "ctrl-l", title: "Ctrl-L" },
  { id: "ctrl-a", title: "Ctrl-A" },
  { id: "ctrl-e", title: "Ctrl-E" },
];

const DIRECTION_ACTIONS = [
  { id: "up", title: "Up" },
  { id: "down", title: "Down" },
  { id: "left", title: "Left" },
  { id: "right", title: "Right" },
];

const AGENT_ACTIONS = [
  { id: "agent-continue", title: "Continue" },
  { id: "agent-yes", title: "Yes" },
  { id: "agent-no", title: "No" },
  { id: "new-terminal", title: "New terminal" },
  { id: "switch-terminal", title: "Switch terminal" },
];

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
  },
  root: {
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 0,
  },
  scroller: {
    flex: 1,
    minWidth: 0,
    overflow: "scroll",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  content: {
    alignItems: "center",
    gap: spacing.terminalKeycapGap,
    minHeight: 44,
    paddingLeft: spacing.terminalChromeX,
    paddingRight: 20,
    paddingVertical: 4,
  },
  fallback: {},
  keycap: {
    alignItems: "center",
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 46,
    paddingHorizontal: 10,
  },
  keycapText: {
    ...typography.terminalKeycapLabel,
  },
  trailingSpace: {
    width: 16,
  },
});
