import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  encodeTerminalKey,
  NO_TERMINAL_MODIFIERS,
  type TerminalKeyResult,
  type TerminalModifierState,
} from "@/features/terminal/terminal-key-encoding";
import { CheckIcon } from "@/ui/icons/lucide-native";

const KEY_COLOR = "#3a3a3c";
const KEY_PRESSED = "#505054";
const KEY_ACTIVE = "#0a84ff";
const LABEL = "#f5f5f7";
const BODY_HEIGHT = 248;

const MODIFIERS = ["ctrl", "shift", "option", "command"] as const;
type ModifierName = (typeof MODIFIERS)[number];

const MODIFIER_LABEL: Record<ModifierName, string> = {
  command: "⌘",
  ctrl: "Ctrl",
  option: "Option",
  shift: "Shift",
};

const MODIFIER_NAME: Record<ModifierName, string> = {
  command: "Command",
  ctrl: "Control",
  option: "Option",
  shift: "Shift",
};

const KEY_LABEL: Record<string, string> = {
  backspace: "⌫",
  caps: "Caps",
  delete: "Del",
  down: "↓",
  end: "End",
  enter: "Enter",
  esc: "Esc",
  home: "Home",
  insert: "Ins",
  left: "←",
  pagedown: "PgDn",
  pageup: "PgUp",
  pause: "Pause",
  prtsc: "PrtScr",
  right: "→",
  "scroll-lock": "ScrLK",
  space: "Space",
  tab: "Tab",
  up: "↑",
};

const KEY_NAME: Record<string, string> = {
  caps: "Caps lock",
  delete: "Forward delete",
  down: "Down",
  end: "End",
  enter: "Enter",
  esc: "Escape",
  home: "Home",
  insert: "Insert",
  left: "Left",
  pagedown: "Page down",
  pageup: "Page up",
  pause: "Pause",
  prtsc: "Print screen",
  right: "Right",
  "scroll-lock": "Scroll lock",
  space: "Space",
  tab: "Tab",
  up: "Up",
};

type KeyDef = { flex?: number; id: string };

const SYMBOLS: KeyDef[] = ["-", "+", "{", "}", "[", "]", "\\", "|", ";", ":", "'", '"', "<", ",", ">", ".", "?", "/"].map(
  (id) => ({ id }),
);
const NUMBERS: KeyDef[] = "1234567890".split("").map((id) => ({ id }));
const QWERTY: KeyDef[] = "qwertyuiop".split("").map((id) => ({ id }));
const ASDF: KeyDef[] = "asdfghjkl".split("").map((id) => ({ id }));
const ZXCV: KeyDef[] = [..."zxcvbnm".split("").map((id) => ({ id })), { flex: 3, id: "space" }];

const FUNCTION_ROWS: KeyDef[][] = [
  ["esc", "tab", "`", "~", "prtsc", "scroll-lock", "pause"].map((id) => ({ id })),
  ["f1", "f2", "f3", "insert", "home", "pageup"].map((id) => ({ id })),
  ["f4", "f5", "f6", "delete", "end", "pagedown"].map((id) => ({ id })),
  ["f7", "f8", "f9", "caps", "spacer", "up"].map((id) => ({ id })),
  ["f10", "f11", "f12", "left", "down", "right"].map((id) => ({ id })),
];

function labelFor(id: string): string {
  if (/^[a-z]$/.test(id)) return id.toUpperCase();
  if (/^f\d+$/.test(id)) return id.toUpperCase();
  return KEY_LABEL[id] ?? id;
}

function nameFor(id: string): string {
  if (/^[a-z]$/.test(id)) return id.toUpperCase();
  return KEY_NAME[id] ?? labelFor(id);
}

export function TerminalBuiltinKeyboard({ onKey }: { onKey: (result: TerminalKeyResult) => void }) {
  const [boardWidth, setBoardWidth] = useState(0);
  const [caps, setCaps] = useState(false);
  const [comboMode, setComboMode] = useState(true);
  const [held, setHeld] = useState<TerminalModifierState>(NO_TERMINAL_MODIFIERS);
  const [latched, setLatched] = useState<TerminalModifierState>(NO_TERMINAL_MODIFIERS);
  const [page, setPage] = useState(0);
  const capsRef = useRef(false);
  const comboModeRef = useRef(true);
  const heldRef = useRef(held);
  const latchedRef = useRef(latched);
  const pagerRef = useRef<ScrollView>(null);

  const clearModifiers = () => {
    const next = { ...NO_TERMINAL_MODIFIERS };
    latchedRef.current = next;
    heldRef.current = { ...NO_TERMINAL_MODIFIERS };
    setLatched(next);
    setHeld({ ...NO_TERMINAL_MODIFIERS });
  };

  const toggleCombo = () => {
    comboModeRef.current = !comboModeRef.current;
    setComboMode(comboModeRef.current);
    clearModifiers();
  };

  const toggleModifier = (name: ModifierName) => {
    const next = { ...latchedRef.current, [name]: !latchedRef.current[name] };
    latchedRef.current = next;
    setLatched(next);
  };

  const setModifierHeld = (name: ModifierName, active: boolean) => {
    const next = { ...heldRef.current, [name]: active };
    heldRef.current = next;
    setHeld(next);
  };

  const emit = (id: string) => {
    if (id === "caps") {
      capsRef.current = !capsRef.current;
      setCaps(capsRef.current);
      return;
    }
    const result = encodeTerminalKey(
      id,
      {
        command: latchedRef.current.command || heldRef.current.command,
        ctrl: latchedRef.current.ctrl || heldRef.current.ctrl,
        option: latchedRef.current.option || heldRef.current.option,
        shift: latchedRef.current.shift || heldRef.current.shift,
      },
      capsRef.current,
    );
    if (!result) return;
    onKey(result);
    if (!comboModeRef.current) clearModifiers();
  };

  const showPage = (index: 0 | 1) => {
    setPage(index);
    if (boardWidth > 0) pagerRef.current?.scrollTo({ animated: true, x: index * boardWidth });
  };

  const syncPage = (offsetX: number) => {
    if (boardWidth <= 0) return;
    const next = Math.round(offsetX / boardWidth);
    setPage(next === 0 ? 0 : 1);
  };

  return (
    <View style={styles.keyboard}>
      <View style={styles.modifierRow}>
        <Pressable
          accessibilityLabel="组合键模式"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: comboMode }}
          onPress={toggleCombo}
          style={styles.combo}
        >
          <View style={[styles.checkbox, comboMode && styles.checkboxOn]}>
            {comboMode ? <CheckIcon color="#ffffff" size={12} strokeWidth={3} /> : null}
          </View>
          <Text numberOfLines={1} style={styles.comboLabel}>
            组合键模式
          </Text>
        </Pressable>
        {MODIFIERS.map((name) => {
          const active = latched[name] || held[name];
          return (
            <Pressable
              accessibilityLabel={MODIFIER_NAME[name]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={name}
              onPress={() => toggleModifier(name)}
              onPressIn={() => setModifierHeld(name, true)}
              onPressOut={() => setModifierHeld(name, false)}
              style={({ pressed }) => [styles.modifier, (pressed || active) && styles.keyActive]}
            >
              <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.modifierLabel}>
                {MODIFIER_LABEL[name]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setBoardWidth((current) => (current === next ? current : next));
        }}
      >
        {boardWidth > 0 ? (
          <ScrollView
            horizontal
            bounces={false}
            onMomentumScrollEnd={(event) => syncPage(event.nativeEvent.contentOffset.x)}
            onScrollEndDrag={(event) => syncPage(event.nativeEvent.contentOffset.x)}
            pagingEnabled
            ref={pagerRef}
            showsHorizontalScrollIndicator={false}
            style={{ height: BODY_HEIGHT, width: boardWidth }}
          >
            <View style={{ width: boardWidth }}>
              <TypingBoard onEmit={emit} />
            </View>
            <View style={{ width: boardWidth }}>
              <FunctionBoard caps={caps} onEmit={emit} />
            </View>
          </ScrollView>
        ) : (
          <View style={{ height: BODY_HEIGHT }} />
        )}
      </View>
      <View style={styles.dots}>
        {[0, 1].map((index) => (
          <Pressable
            accessibilityLabel={index === 0 ? "Letter keys" : "Function keys"}
            accessibilityRole="button"
            key={index}
            onPress={() => showPage(index as 0 | 1)}
            style={[styles.dot, page === index && styles.dotOn]}
          />
        ))}
      </View>
    </View>
  );
}

function TypingBoard({ onEmit }: { onEmit: (id: string) => void }) {
  return (
    <View style={styles.board}>
      <KeyRow gap={3} keys={SYMBOLS} onEmit={onEmit} small />
      <KeyRow keys={NUMBERS} onEmit={onEmit} />
      <KeyRow keys={QWERTY} onEmit={onEmit} />
      <View style={styles.enterRow}>
        <View style={styles.enterSide}>
          <KeyRow keys={ASDF} onEmit={onEmit} />
          <KeyRow keys={ZXCV} onEmit={onEmit} />
        </View>
        <KeyButton fill label="Enter" name="Enter" onPress={() => onEmit("enter")} style={styles.enterKey} />
      </View>
    </View>
  );
}

function FunctionBoard({ caps, onEmit }: { caps: boolean; onEmit: (id: string) => void }) {
  return (
    <View style={styles.board}>
      {FUNCTION_ROWS.map((keys) => (
        <KeyRow activeId={caps ? "caps" : undefined} key={keys.map((key) => key.id).join("-")} keys={keys} onEmit={onEmit} />
      ))}
    </View>
  );
}

function KeyRow({
  activeId,
  gap,
  keys,
  onEmit,
  small,
}: {
  activeId?: string;
  gap?: number;
  keys: KeyDef[];
  onEmit: (id: string) => void;
  small?: boolean;
}) {
  return (
    <View style={[styles.keyRow, gap !== undefined ? { gap } : null]}>
      {keys.map((key) =>
        key.id === "spacer" ? (
          <View key="spacer" style={{ flex: key.flex ?? 1 }} />
        ) : (
          <KeyButton
            active={key.id === activeId}
            flex={key.flex}
            key={key.id}
            label={labelFor(key.id)}
            name={nameFor(key.id)}
            onPress={() => onEmit(key.id)}
            small={small}
          />
        ),
      )}
    </View>
  );
}

function KeyButton({
  active,
  fill,
  flex = 1,
  label,
  name,
  onPress,
  small,
  style,
}: {
  active?: boolean;
  fill?: boolean;
  flex?: number;
  label: string;
  name: string;
  onPress: () => void;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        !fill && { height: small ? 34 : 42 },
        { flex },
        pressed && styles.keyPressed,
        active && styles.keyActive,
        style,
      ]}
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={[styles.keyLabel, small && styles.keyLabelSmall]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  board: {
    gap: 6,
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#8e8e93",
    borderRadius: 5,
    borderWidth: 1.5,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  checkboxOn: {
    backgroundColor: KEY_ACTIVE,
    borderColor: KEY_ACTIVE,
  },
  combo: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 6,
    height: 36,
    paddingRight: 4,
  },
  comboLabel: {
    color: LABEL,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  dot: {
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  dotOn: {
    backgroundColor: "#ffffff",
    width: 16,
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 8,
  },
  enterKey: {
    alignSelf: "stretch",
    flex: 0,
    marginLeft: 6,
    width: 68,
  },
  enterRow: {
    flexDirection: "row",
  },
  enterSide: {
    flex: 1,
    gap: 6,
  },
  key: {
    alignItems: "center",
    backgroundColor: KEY_COLOR,
    borderRadius: 8,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 2,
  },
  keyActive: {
    backgroundColor: KEY_ACTIVE,
  },
  keyboard: {
    marginTop: 8,
    paddingHorizontal: 2,
  },
  keyLabel: {
    color: LABEL,
    fontSize: 16,
    fontWeight: "500",
  },
  keyLabelSmall: {
    fontSize: 12,
  },
  keyPressed: {
    backgroundColor: KEY_PRESSED,
  },
  keyRow: {
    flexDirection: "row",
    gap: 6,
  },
  modifier: {
    alignItems: "center",
    backgroundColor: KEY_COLOR,
    borderRadius: 8,
    flex: 1,
    height: 36,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 2,
  },
  modifierLabel: {
    color: LABEL,
    fontSize: 13,
    fontWeight: "600",
  },
  modifierRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
});
