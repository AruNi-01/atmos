import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TerminalSelectionChrome, TerminalSelectionHandle } from "@/features/terminal/terminal-selection-chrome";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "@/ui/primitives/glass-panel";


export function TerminalSelectionOverlay({
  onCopy,
  onPaste,
  selection,
}: {
  onCopy: (text: string) => void;
  onPaste: () => void;
  selection: TerminalSelectionChrome | null;
}) {
  const theme = useMobileTheme();
  const [copied, setCopied] = useState(false);
  const [toolbarSize, setToolbarSize] = useState({ height: 44, width: 148 });
  const [bounds, setBounds] = useState({ height: 0, width: 0 });

  useEffect(() => {
    setCopied(false);
  }, [selection?.text]);

  if (!selection) return null;

  const left = clamp(selection.anchorX - toolbarSize.width / 2, 8, Math.max(8, bounds.width - toolbarSize.width - 8));
  let top = selection.anchorY - toolbarSize.height - 18;
  if (top < 8) top = selection.anchorY + 28;
  top = Math.min(top, Math.max(8, bounds.height - toolbarSize.height - 8));

  const handleColor = theme.colors.terminalFg;
  const keycapStyle = { backgroundColor: theme.colors.terminalKeycap };
  const keycapPressedStyle = { backgroundColor: theme.colors.terminalKeycapPressed };

  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBounds((current) => (current.width === width && current.height === height ? current : { height, width }));
      }}
      pointerEvents="box-none"
      style={styles.overlay}
    >
      {selection.start ? <SelectionHandle anchor={selection.start} color={handleColor} edge="start" /> : null}
      {selection.end ? <SelectionHandle anchor={selection.end} color={handleColor} edge="end" /> : null}
      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setToolbarSize((current) => (current.width === width && current.height === height ? current : { height, width }));
        }}
        pointerEvents="box-none"
        style={[styles.toolbarSlot, { left, top }]}
      >
        <GlassPanel
          fallbackStyle={{ backgroundColor: theme.colors.terminalChromeFallback }}
          glassEffectStyle={{ style: "regular", animate: true }}
          interactive
          style={[styles.toolbar, { borderColor: theme.colors.glassBorder }]}
          tintColor={theme.colors.terminalChromeTint}
        >
          <Pressable
            accessibilityLabel="Copy"
            accessibilityRole="button"
            onPress={() => {
              onCopy(selection.text);
              setCopied(true);
            }}
            style={({ pressed }) => [styles.keycap, keycapStyle, pressed && keycapPressedStyle]}
          >
            <Text style={[styles.keycapText, { color: theme.colors.terminalFg }]}>{copied ? "Copied" : "Copy"}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Paste"
            accessibilityRole="button"
            onPress={onPaste}
            style={({ pressed }) => [styles.keycap, keycapStyle, pressed && keycapPressedStyle]}
          >
            <Text style={[styles.keycapText, { color: theme.colors.terminalFg }]}>Paste</Text>
          </Pressable>
        </GlassPanel>
      </View>
    </View>
  );
}

function SelectionHandle({
  anchor,
  color,
  edge,
}: {
  anchor: TerminalSelectionHandle;
  color: string;
  edge: "start" | "end";
}) {
  return (
    <View
      pointerEvents="none"
      style={[styles.handle, { height: anchor.height, left: anchor.x - 14, top: anchor.y }]}
    >
      <View style={[styles.knob, edge === "start" ? styles.knobStart : styles.knobEnd, { backgroundColor: color }]} />
      <View style={[styles.bar, { backgroundColor: color }]} />
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 1,
    bottom: 0,
    left: 13,
    position: "absolute",
    top: 0,
    width: 2,
  },
  handle: {
    position: "absolute",
    width: 28,
  },
  keycap: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.pill,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 12,
  },
  keycapText: {
    ...typography.terminalKeycapLabel,
  },
  knob: {
    borderRadius: radii.pill,
    height: 14,
    left: 7,
    position: "absolute",
    width: 14,
  },
  knobEnd: {
    bottom: -16,
  },
  knobStart: {
    top: -16,
  },
  overlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  toolbar: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  toolbarSlot: {
    flexDirection: "row",
    position: "absolute",
  },
});
