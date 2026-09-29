import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TerminalBuiltinKeyboard } from "@/features/terminal/TerminalBuiltinKeyboard";
import { terminalComposerInput } from "@/features/terminal/terminal-composer";
import { shortcutEdgeFade, TERMINAL_SHORTCUT_BAR_COLOR } from "@/features/terminal/terminal-edge-fade";
import type { TerminalKeyboardAction } from "@/features/terminal/terminal-keyboard";
import type { TerminalKeyResult } from "@/features/terminal/terminal-key-encoding";
import {
  terminalBarShortcutIds,
  terminalShortcuts,
  type TerminalBarShortcutId,
  type TerminalShortcut,
} from "@/features/terminal/terminal-shortcuts";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  KeyboardIcon,
  MessageCircleIcon,
  SendIcon,
  XIcon,
} from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";

const FADE_WIDTH = 22;
const LEFT_FADE = shortcutEdgeFade("left");
const RIGHT_FADE = shortcutEdgeFade("right");

const SHORTCUT_LABEL: Record<TerminalBarShortcutId, string> = {
  at: "@",
  "command-c": "⌘C",
  "command-v": "⌘V",
  "command-z": "⌘Z",
  down: "↓",
  enter: "↵",
  esc: "Esc",
  left: "←",
  right: "→",
  "shift-enter": "⇧↵",
  "shift-tab": "⇧Tab",
  slash: "/",
  tab: "Tab",
  up: "↑",
};

const SHORTCUT_NAME: Record<TerminalBarShortcutId, string> = {
  at: "At",
  "command-c": "Command C",
  "command-v": "Command V",
  "command-z": "Command Z",
  down: "Down",
  enter: "Enter",
  esc: "Escape",
  left: "Left",
  right: "Right",
  "shift-enter": "Shift Enter",
  "shift-tab": "Shift Tab",
  slash: "Slash",
  tab: "Tab",
  up: "Up",
};

type KeyboardPanel = "builtin" | "hidden" | "system";

export function TerminalShortcutBar({
  enabled = true,
  onInsertText,
  onShortcut,
  onSystemKeyboard,
}: {
  enabled?: boolean;
  onInsertText?: (data: string) => void;
  onShortcut: (shortcut: TerminalShortcut) => void;
  onSystemKeyboard?: (action: TerminalKeyboardAction) => void;
}) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [panel, setPanel] = useState<KeyboardPanel>("hidden");
  const shortcutsById = useMemo(() => new Map(terminalShortcuts.map((shortcut) => [shortcut.id, shortcut])), []);
  const bottomPadding = keyboardVisible ? 6 : Math.max(insets.bottom, 8);
  const expanded = keyboardVisible || panel === "builtin";
  const canSend = draft.trim().length > 0;

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

  useEffect(() => {
    if (!composerOpen || panel !== "system") return undefined;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [composerOpen, panel]);

  if (!enabled) return null;

  const keycapStyle = { backgroundColor: theme.colors.terminalKeycap };
  const keycapPressedStyle = { backgroundColor: theme.colors.terminalKeycapPressed };
  const labelStyle = { color: theme.colors.terminalFg };

  const showSystemKeyboard = () => {
    setPanel("system");
    if (!composerOpen) onSystemKeyboard?.("focus-terminal");
  };

  const hideKeyboard = () => {
    setPanel("hidden");
    onSystemKeyboard?.("dismiss");
  };

  const onChevron = () => {
    if (expanded) {
      hideKeyboard();
      return;
    }
    showSystemKeyboard();
  };

  const onSwitchKeyboard = () => {
    if (panel === "builtin") {
      showSystemKeyboard();
      return;
    }
    setPanel("builtin");
    onSystemKeyboard?.("dismiss");
  };

  const onChat = () => {
    if (composerOpen) {
      setComposerOpen(false);
      setDraft("");
      hideKeyboard();
      return;
    }
    setComposerOpen(true);
    setPanel("system");
    onSystemKeyboard?.("blur-terminal");
  };

  const sendDraft = () => {
    const payload = terminalComposerInput(draft);
    if (!payload) return;
    onInsertText?.(payload);
    setDraft("");
  };

  const onBuiltinKey = (result: TerminalKeyResult) => {
    if (result.type === "input") {
      onInsertText?.(result.data);
      return;
    }
    const shortcut = shortcutsById.get(result.action === "copy" ? "command-c" : "command-v");
    if (shortcut) onShortcut(shortcut);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.terminalBg, paddingBottom: bottomPadding }]}>
      {composerOpen ? (
        <GlassPanel
          colorScheme="dark"
          fallbackStyle={{ backgroundColor: TERMINAL_SHORTCUT_BAR_COLOR }}
          glassEffectStyle={{ animate: true, style: "regular" }}
          style={styles.composer}
          tintColor="rgba(44, 44, 46, 0.72)"
        >
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            cursorColor="#0a84ff"
            keyboardAppearance="dark"
            multiline
            onChangeText={setDraft}
            placeholderTextColor="rgba(248, 248, 248, 0.45)"
            ref={inputRef}
            selectionColor="#0a84ff"
            spellCheck={false}
            style={styles.composerInput}
            value={draft}
          />
          <View style={styles.composerActions}>
            <Pressable
              accessibilityLabel="Close input"
              accessibilityRole="button"
              onPress={onChat}
              style={({ pressed }) => [styles.composerIconButton, pressed && styles.composerIconPressed]}
            >
              <XIcon color={theme.colors.terminalFg} size={16} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              accessibilityLabel="Send to terminal"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={sendDraft}
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: canSend ? "#0a84ff" : "#3a3a3c" },
                pressed && canSend && styles.sendPressed,
              ]}
            >
              <SendIcon color="#ffffff" size={16} strokeWidth={2.4} />
            </Pressable>
          </View>
        </GlassPanel>
      ) : (
        <View style={styles.pill}>
          <View style={styles.row}>
            <View style={styles.scrollerWrap}>
              <ScrollView
                horizontal
                contentContainerStyle={styles.scrollerContent}
                keyboardShouldPersistTaps="always"
                showsHorizontalScrollIndicator={false}
                style={styles.scroller}
              >
                {terminalBarShortcutIds.map((shortcutId) => {
                  const shortcut = shortcutsById.get(shortcutId);
                  if (!shortcut) return null;
                  return (
                    <Pressable
                      accessibilityLabel={SHORTCUT_NAME[shortcutId]}
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
              <View pointerEvents="none" style={[styles.fade, styles.fadeLeft, { experimental_backgroundImage: LEFT_FADE }]} />
              <View pointerEvents="none" style={[styles.fade, styles.fadeRight, { experimental_backgroundImage: RIGHT_FADE }]} />
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityLabel={composerOpen ? "Close input" : "Terminal input"}
                accessibilityRole="button"
                onPress={onChat}
                style={({ pressed }) => [styles.keycap, styles.iconKeycap, keycapStyle, pressed && keycapPressedStyle]}
              >
                <MessageCircleIcon color={theme.colors.terminalFg} size={18} strokeWidth={2.2} />
              </Pressable>
              <Pressable
                accessibilityLabel={panel === "builtin" ? "Use system keyboard" : "Use built-in keyboard"}
                accessibilityRole="button"
                accessibilityState={{ selected: panel === "builtin" }}
                onPress={onSwitchKeyboard}
                style={({ pressed }) => [
                  styles.keycap,
                  styles.iconKeycap,
                  keycapStyle,
                  panel === "builtin" && styles.iconKeycapSelected,
                  pressed && keycapPressedStyle,
                ]}
              >
                <KeyboardIcon color={theme.colors.terminalFg} size={18} strokeWidth={2.2} />
              </Pressable>
              <Pressable
                accessibilityLabel={expanded ? "Hide keyboard" : "Show keyboard"}
                accessibilityRole="button"
                onPress={onChevron}
                style={({ pressed }) => [styles.keycap, styles.iconKeycap, keycapStyle, pressed && keycapPressedStyle]}
              >
                {expanded ? (
                  <ChevronDownIcon color={theme.colors.terminalFg} size={18} strokeWidth={2.2} />
                ) : (
                  <ChevronUpIcon color={theme.colors.terminalFg} size={18} strokeWidth={2.2} />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
      {panel === "builtin" ? <TerminalBuiltinKeyboard onKey={onBuiltinKey} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingRight: 8,
  },
  composer: {
    borderRadius: radii.terminalChrome,
  },
  composerActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
    paddingHorizontal: 10,
    paddingTop: 2,
  },
  composerIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  composerIconPressed: {
    opacity: 0.7,
  },
  composerInput: {
    color: "#f8f8f8",
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 96,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  container: {
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  fade: {
    bottom: 0,
    position: "absolute",
    top: 0,
    width: FADE_WIDTH,
  },
  fadeLeft: {
    left: 0,
  },
  fadeRight: {
    right: 0,
  },
  iconKeycap: {
    minWidth: 40,
    paddingHorizontal: 8,
  },
  iconKeycapSelected: {
    backgroundColor: "rgba(10, 132, 255, 0.35)",
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
  keycapText: {
    ...typography.terminalKeycapLabel,
    textAlign: "center",
  },
  pill: {
    backgroundColor: TERMINAL_SHORTCUT_BAR_COLOR,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderCurve: "continuous",
    borderRadius: radii.terminalChrome,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
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
    paddingRight: 8,
  },
  scrollerWrap: {
    flex: 1,
    minWidth: 0,
  },
  sendButton: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  sendPressed: {
    opacity: 0.8,
  },
});
