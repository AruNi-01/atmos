import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import TerminalDomView, { type TerminalDomHandle } from "@/features/terminal/TerminalDomView";
import type { TerminalSnapshot } from "@atmos/shared/terminal";
import { colors } from "@/theme/colors";

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
  onTitleChange?: (title: string) => void;
  sessionId: string;
}>(function TerminalWebView(
  { connected, onInput, onReady, onRendererError, onResize, onTitleChange, sessionId },
  ref,
) {
  const domRef = useRef<TerminalDomHandle>(null);
  const pendingBase64ChunksRef = useRef<string[]>([]);
  const pendingSnapshotRef = useRef<TerminalSnapshot | null>(null);

  const flushPendingBase64 = () => {
    const writeBase64 = domRef.current?.writeBase64;
    if (!writeBase64 || pendingBase64ChunksRef.current.length === 0) return;

    const chunks = pendingBase64ChunksRef.current;
    pendingBase64ChunksRef.current = [];
    writeBase64(chunks);
  };

  const flushPendingDomWork = () => {
    const restoreSnapshot = domRef.current?.restoreSnapshot;
    if (restoreSnapshot && pendingSnapshotRef.current) {
      const snapshot = pendingSnapshotRef.current;
      pendingSnapshotRef.current = null;
      restoreSnapshot(snapshot);
    }

    flushPendingBase64();
  };

  const restoreSnapshot = (snapshot: TerminalSnapshot) => {
    const restore = domRef.current?.restoreSnapshot;
    if (!restore) {
      pendingSnapshotRef.current = snapshot;
      return;
    }

    restore(snapshot);
    flushPendingBase64();
  };

  const writeBase64 = (chunks: string[]) => {
    if (chunks.length === 0) return;

    const write = domRef.current?.writeBase64;
    if (!write) {
      pendingBase64ChunksRef.current.push(...chunks);
      return;
    }

    if (pendingBase64ChunksRef.current.length > 0) {
      const queuedChunks = pendingBase64ChunksRef.current;
      pendingBase64ChunksRef.current = [];
      write([...queuedChunks, ...chunks]);
      return;
    }

    write(chunks);
  };

  const send = (message: NativeToTerminal) => {
    const terminal = domRef.current;
    if (!terminal) {
      if (message.type === "restore_snapshot") restoreSnapshot(message.snapshot);
      if (message.type === "write_b64") writeBase64(message.chunks);
      return;
    }

    switch (message.type) {
      case "clear":
        terminal.clear?.();
        break;
      case "focus":
        terminal.focus?.();
        break;
      case "insert_text":
        terminal.insertText?.(message.text, message.submit);
        break;
      case "resize":
        terminal.fit?.();
        break;
      case "restore_snapshot":
        restoreSnapshot(message.snapshot);
        break;
      case "send_sequence":
        terminal.sendSequence?.(message.sequence);
        break;
      case "write_b64":
        writeBase64(message.chunks);
        break;
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => domRef.current?.focus?.(),
      restoreSnapshot,
      send,
      writeBase64,
    }),
    [],
  );

  return (
    <View style={styles.frame} testID={`terminal-frame-${sessionId}`}>
      <TerminalDomView
        ref={domRef}
        connected={connected}
        onInput={async (data) => onInput(data)}
        onReady={async (cols, rows) => {
          flushPendingDomWork();
          onReady?.({ cols, rows });
        }}
        onRendererError={async (message) => onRendererError?.(message)}
        onResize={async (cols, rows) => onResize?.({ cols, rows })}
        onTitleChange={async (nextTitle) => onTitleChange?.(nextTitle)}
        dom={{
          contentInsetAdjustmentBehavior: "never",
          keyboardDisplayRequiresUserAction: false,
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
    flex: 1,
    minHeight: 360,
  },
});
