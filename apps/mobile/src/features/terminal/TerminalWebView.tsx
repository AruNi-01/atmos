import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import TerminalDomView, { type TerminalDomHandle } from "@/features/terminal/TerminalDomView";
import type { TerminalSnapshot } from "@atmos/shared/terminal";
import { colors, radii } from "@/theme/colors";

export type NativeToTerminal =
  | { type: "send_sequence"; sequence: string }
  | { type: "insert_text"; text: string; submit?: boolean }
  | { type: "write_b64"; chunks: string[] }
  | { type: "restore_snapshot"; snapshot: TerminalSnapshot }
  | { type: "resize"; cols: number; rows: number }
  | { type: "focus" }
  | { type: "clear" };

export type TerminalWebViewHandle = {
  send: (message: NativeToTerminal) => void;
  focus: () => void;
  writeBase64: (chunks: string[]) => void;
  restoreSnapshot: (snapshot: TerminalSnapshot) => void;
};

export const TerminalWebView = forwardRef<TerminalWebViewHandle, {
  connected: boolean;
  onInput: (data: string) => void;
  onReady?: (size: { cols: number; rows: number }) => void;
  onRendererError?: (message: string) => void;
  onResize?: (size: { cols: number; rows: number }) => void;
  sessionId: string;
  title: string;
}>(function TerminalWebView(
  { connected, onInput, onReady, onRendererError, onResize, sessionId, title },
  ref,
) {
  const domRef = useRef<TerminalDomHandle>(null);

  const send = (message: NativeToTerminal) => {
    const terminal = domRef.current;
    if (!terminal) return;

    switch (message.type) {
      case "clear":
        terminal.clear();
        break;
      case "focus":
        terminal.focus();
        break;
      case "insert_text":
        terminal.insertText(message.text, message.submit);
        break;
      case "resize":
        terminal.fit();
        break;
      case "restore_snapshot":
        terminal.restoreSnapshot(message.snapshot);
        break;
      case "send_sequence":
        terminal.sendSequence(message.sequence);
        break;
      case "write_b64":
        terminal.writeBase64(message.chunks);
        break;
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => domRef.current?.focus(),
      restoreSnapshot: (snapshot) => domRef.current?.restoreSnapshot(snapshot),
      send,
      writeBase64: (chunks) => domRef.current?.writeBase64(chunks),
    }),
    [],
  );

  return (
    <View style={styles.frame} testID={`terminal-frame-${sessionId}`}>
      <TerminalDomView
        ref={domRef}
        connected={connected}
        title={title}
        onInput={async (data) => onInput(data)}
        onReady={async (cols, rows) => onReady?.({ cols, rows })}
        onRendererError={async (message) => onRendererError?.(message)}
        onResize={async (cols, rows) => onResize?.({ cols, rows })}
        dom={{
          contentInsetAdjustmentBehavior: "never",
          scrollEnabled: false,
          style: styles.dom,
          useExpoDOMWebView: true,
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  dom: {
    backgroundColor: colors.terminalBg,
    flex: 1,
    height: "100%",
    width: "100%",
  },
  frame: {
    backgroundColor: colors.terminalBg,
    borderRadius: radii.card,
    borderCurve: "continuous",
    flex: 1,
    minHeight: 360,
    overflow: "hidden",
  },
});
