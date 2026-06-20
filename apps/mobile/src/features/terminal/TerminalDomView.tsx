"use dom";

import { useEffect, useRef, type Ref } from "react";
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from "expo/dom";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  base64ToBytes,
  buildTerminalSnapshotRestorePayload,
  extractCommandName,
  isTerminalSnapshot,
  isUsableTerminalGrid,
  shortenPath,
  terminalTheme,
  type TerminalSnapshot,
} from "@atmos/shared/terminal";

export type TerminalDomHandle = {
  focus: () => void;
  fit: () => void;
  writeBase64: (chunks: string[]) => void;
  writeText: (text: string) => void;
  sendSequence: (sequence: string) => void;
  insertText: (text: string, submit?: boolean) => void;
  restoreSnapshot: (snapshot: TerminalSnapshot) => void;
  clear: () => void;
};

type Props = {
  connected: boolean;
  onInput: (data: string) => Promise<void>;
  onResize: (cols: number, rows: number) => Promise<void>;
  onReady: (cols: number, rows: number) => Promise<void>;
  onRendererError: (message: string) => Promise<void>;
  onTitleChange: (title: string) => Promise<void>;
  ref?: React.Ref<TerminalDomHandle>;
  dom?: DOMProps;
};

type DomJsonValue = boolean | number | string | null | DomJsonValue[] | { [key: string]: DomJsonValue | undefined };

export default function TerminalDomView({
  connected,
  onInput,
  onReady,
  onRendererError,
  onResize,
  onTitleChange,
  ref,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const callbacksRef = useRef({ onInput, onReady, onRendererError, onResize, onTitleChange });
  const cmdStartTimerRef = useRef<number | null>(null);
  const lastTitleRef = useRef<string | null>(null);

  callbacksRef.current = { onInput, onReady, onRendererError, onResize, onTitleChange };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const terminal = new Terminal({
      allowTransparency: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      disableStdin: !connected,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.18,
      macOptionIsMeta: true,
      scrollback: 10000,
      theme: terminalTheme,
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(mount);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const focusTerminal = () => {
      terminal.focus();
    };
    const focusOptions = { capture: true };
    const passiveFocusOptions = { capture: true, passive: true };
    mount.addEventListener("pointerdown", focusTerminal, focusOptions);
    mount.addEventListener("touchstart", focusTerminal, passiveFocusOptions);
    mount.addEventListener("click", focusTerminal, focusOptions);

    const reportError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      void callbacksRef.current.onRendererError(message);
    };

    const fitAndReport = () => {
      try {
        fitAddon.fit();
        void callbacksRef.current.onResize(terminal.cols, terminal.rows);
      } catch (error) {
        reportError(error);
      }
    };

    const onData = terminal.onData((data) => {
      void callbacksRef.current.onInput(data).catch(reportError);
    });
    const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
      void callbacksRef.current.onResize(cols, rows).catch(reportError);
    });

    const CMD_START_DELAY_MS = 150;
    terminal.parser.registerOscHandler(9999, (data: string) => {
      const colonIdx = data.indexOf(":");
      if (colonIdx === -1) return true;

      const metaType = data.substring(0, colonIdx);
      const payload = data.substring(colonIdx + 1);

      if (metaType === "CMD_START") {
        const nextTitle = extractCommandName(payload);
        if (cmdStartTimerRef.current) {
          window.clearTimeout(cmdStartTimerRef.current);
        }
        cmdStartTimerRef.current = window.setTimeout(() => {
          cmdStartTimerRef.current = null;
          if (nextTitle !== lastTitleRef.current) {
            lastTitleRef.current = nextTitle;
            void callbacksRef.current.onTitleChange(nextTitle).catch(reportError);
          }
        }, CMD_START_DELAY_MS);
        return true;
      }

      if (metaType === "CMD_END") {
        if (cmdStartTimerRef.current) {
          window.clearTimeout(cmdStartTimerRef.current);
          cmdStartTimerRef.current = null;
        }
        const nextTitle = shortenPath(payload);
        if (nextTitle !== lastTitleRef.current) {
          lastTitleRef.current = nextTitle;
          void callbacksRef.current.onTitleChange(nextTitle).catch(reportError);
        }
      }

      return true;
    });

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => window.requestAnimationFrame(fitAndReport))
        : null;
    resizeObserver?.observe(mount);
    window.requestAnimationFrame(() => {
      fitAndReport();
      void callbacksRef.current.onReady(terminal.cols, terminal.rows).catch(reportError);
    });

    return () => {
      if (cmdStartTimerRef.current) {
        window.clearTimeout(cmdStartTimerRef.current);
        cmdStartTimerRef.current = null;
      }
      mount.removeEventListener("pointerdown", focusTerminal, focusOptions);
      mount.removeEventListener("touchstart", focusTerminal, passiveFocusOptions);
      mount.removeEventListener("click", focusTerminal, focusOptions);
      resizeObserver?.disconnect();
      onData.dispose();
      onResizeDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.disableStdin = !connected;
    }
  }, [connected]);

  useDOMImperativeHandle(
    (ref ?? null) as Ref<DOMImperativeFactory>,
    () => ({
      clear: () => terminalRef.current?.clear(),
      fit: () => fitAddonRef.current?.fit(),
      focus: () => terminalRef.current?.focus(),
      insertText: (...args: DomJsonValue[]) => {
        const text = typeof args[0] === "string" ? args[0] : "";
        const submit = args[1] === true;
        const data = `${text}${submit ? "\r" : ""}`;
        terminalRef.current?.input(data, false);
      },
      restoreSnapshot: (...args: DomJsonValue[]) => {
        const snapshot = args[0] as TerminalSnapshot;
        const terminal = terminalRef.current;
        if (!terminal || !isTerminalSnapshot(snapshot)) return;
        const { payload, useAlternateScreen } = buildTerminalSnapshotRestorePayload(snapshot);
        terminal.reset();
        if (isUsableTerminalGrid(snapshot.cols, snapshot.rows)) {
          terminal.resize(snapshot.cols, snapshot.rows);
        }
        terminal.write(payload, () => {
          if (!useAlternateScreen) terminal.scrollToBottom();
        });
      },
      sendSequence: (...args: DomJsonValue[]) => {
        const sequence = typeof args[0] === "string" ? args[0] : "";
        terminalRef.current?.input(sequence, false);
      },
      writeBase64: (...args: DomJsonValue[]) => {
        const chunks = Array.isArray(args[0]) ? args[0].filter((chunk): chunk is string => typeof chunk === "string") : [];
        const terminal = terminalRef.current;
        if (!terminal) return;
        for (const chunk of chunks) {
          terminal.write(base64ToBytes(chunk));
        }
      },
      writeText: (...args: DomJsonValue[]) => {
        const text = typeof args[0] === "string" ? args[0] : "";
        terminalRef.current?.write(text);
      },
    }),
    [],
  );

  return (
    <div className="shell" data-connected={connected ? "true" : "false"}>
      <div ref={mountRef} className="terminal" />
      {!connected ? <div className="status">Disconnected</div> : null}
      <style>{`
        html, body, #root {
          background: #0b0f14;
          height: 100%;
          margin: 0;
          overflow: hidden;
          width: 100%;
        }
        * { box-sizing: border-box; }
        .shell {
          background: #0b0f14;
          height: 100%;
          overflow: hidden;
          position: relative;
          width: 100%;
        }
        .terminal {
          height: 100%;
          touch-action: manipulation;
          width: 100%;
        }
        .xterm {
          height: 100%;
          padding: 10px 12px 12px;
        }
        .xterm-viewport {
          background: transparent !important;
        }
        .xterm-screen {
          width: 100% !important;
        }
        .status {
          align-items: center;
          backdrop-filter: blur(16px);
          background: rgba(11, 15, 20, 0.72);
          color: #fca5a5;
          display: flex;
          font: 600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
          inset: 0;
          justify-content: center;
          letter-spacing: 0;
          pointer-events: none;
          position: absolute;
        }
      `}</style>
    </div>
  );
}
