"use dom";

import { useEffect, useRef, type Ref } from "react";
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from "expo/dom";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  base64ToBytes,
  buildTerminalSnapshotRestorePayload,
  extractCommandName,
  isTerminalSnapshot,
  isUsableTerminalGrid,
  shortenPath,
  type TerminalSnapshot,
  type TerminalThemeTokens,
} from "@atmos/shared/terminal";
import {
  ensureMobileTerminalFontsLoaded,
  MOBILE_TERMINAL_FONT_FAMILY,
  MOBILE_TERMINAL_FONT_SIZE,
} from "@/features/terminal/mobile-terminal-fonts";
import { buildTerminalDomCss } from "@/features/terminal/terminal-dom-css";

export type TerminalDomHandle = {
  blur: () => void;
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
  theme: TerminalThemeTokens;
  dom?: DOMProps;
};

type DomJsonValue = boolean | number | string | null | DomJsonValue[] | { [key: string]: DomJsonValue | undefined };

function scrollTerminalToBottom(terminal: Terminal) {
  window.requestAnimationFrame(() => {
    try {
      terminal.scrollToBottom();
    } catch {
      // The terminal may have been disposed between scheduling and the next frame.
    }
  });
}

export default function TerminalDomView({
  connected,
  onInput,
  onReady,
  onRendererError,
  onResize,
  theme,
  onTitleChange,
  ref,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const callbacksRef = useRef({ onInput, onReady, onRendererError, onResize, onTitleChange });
  const cmdStartTimerRef = useRef<number | null>(null);
  const connectedRef = useRef(connected);
  const lastTitleRef = useRef<string | null>(null);

  connectedRef.current = connected;
  callbacksRef.current = { onInput, onReady, onRendererError, onResize, onTitleChange };

  useEffect(() => {
    let isDisposed = false;
    let disposeTerminal: (() => void) | null = null;

    const reportError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      void callbacksRef.current.onRendererError(message);
    };

    void (async () => {
      try {
        await ensureMobileTerminalFontsLoaded();
      } catch (error) {
        reportError(error);
      }

      const mount = mountRef.current;
      if (isDisposed || !mount) return;

      const terminal = new Terminal({
        allowProposedApi: true,
        allowTransparency: false,
        convertEol: false,
        cursorBlink: true,
        cursorStyle: "underline",
        cursorWidth: 1,
        customGlyphs: true,
        disableStdin: !connectedRef.current,
        fontFamily: MOBILE_TERMINAL_FONT_FAMILY,
        fontSize: MOBILE_TERMINAL_FONT_SIZE,
        fontWeight: "400",
        fontWeightBold: "700",
        letterSpacing: 0,
        lineHeight: 1.2,
        macOptionIsMeta: true,
        minimumContrastRatio: 1,
        rescaleOverlappingGlyphs: true,
        scrollback: 10000,
        theme,
      });
      const fitAddon = new FitAddon();
      const unicode11Addon = new Unicode11Addon();
      let webglAddon: WebglAddon | null = null;
      let webglContextLossDisposable: { dispose: () => void } | null = null;

      terminal.loadAddon(unicode11Addon);
      terminal.unicode.activeVersion = "11";
      terminal.loadAddon(fitAddon);
      terminal.open(mount);

      try {
        webglAddon = new WebglAddon();
        terminal.loadAddon(webglAddon);
        webglContextLossDisposable = webglAddon.onContextLoss(() => {
          webglAddon?.dispose();
          webglAddon = null;
          webglContextLossDisposable?.dispose();
          webglContextLossDisposable = null;
        });
      } catch {
        webglAddon = null;
        webglContextLossDisposable = null;
      }

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

      const fitAndReport = () => {
        try {
          fitAddon.fit();
          scrollTerminalToBottom(terminal);
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

      disposeTerminal = () => {
        if (cmdStartTimerRef.current) {
          window.clearTimeout(cmdStartTimerRef.current);
          cmdStartTimerRef.current = null;
        }
        mount.removeEventListener("pointerdown", focusTerminal, focusOptions);
        mount.removeEventListener("touchstart", focusTerminal, passiveFocusOptions);
        mount.removeEventListener("click", focusTerminal, focusOptions);
        resizeObserver?.disconnect();
        webglContextLossDisposable?.dispose();
        webglAddon?.dispose();
        onData.dispose();
        onResizeDisposable.dispose();
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    })();

    return () => {
      isDisposed = true;
      disposeTerminal?.();
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.disableStdin = !connected;
    }
  }, [connected]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = theme;
    }
  }, [theme]);

  useDOMImperativeHandle(
    (ref ?? null) as Ref<DOMImperativeFactory>,
    () => ({
      blur: () => {
        terminalRef.current?.blur();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      },
      clear: () => terminalRef.current?.clear(),
      fit: () => {
        fitAddonRef.current?.fit();
        if (terminalRef.current) {
          scrollTerminalToBottom(terminalRef.current);
        }
      },
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
        for (const [index, chunk] of chunks.entries()) {
          terminal.write(
            base64ToBytes(chunk),
            index === chunks.length - 1 ? () => scrollTerminalToBottom(terminal) : undefined,
          );
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
      <style>{buildTerminalDomCss(theme)}</style>
    </div>
  );
}
