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

const terminalFontRegularUrl = require("../../../assets/fonts/HackNerdFontMono-Regular.ttf") as string;
const terminalFontBoldUrl = require("../../../assets/fonts/HackNerdFontMono-Bold.ttf") as string;

const MOBILE_TERMINAL_FONT_SIZE = 12;
const MOBILE_TERMINAL_FONT_FAMILY =
  '"Hack Nerd Font Mono", "Hack Nerd Font", "Hack", "JetBrains Mono NL", "JetBrains Mono", "Fira Code", "SF Mono", Monaco, "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace';
const NERD_FONT_TEST_GLYPH = "\uE0B6";

let terminalFontLoadPromise: Promise<void> | null = null;

async function ensureMobileTerminalFontsLoaded() {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;

  if (!terminalFontLoadPromise) {
    terminalFontLoadPromise = (async () => {
      const faces = [
        new FontFace("Hack Nerd Font Mono", `url("${terminalFontRegularUrl}")`, {
          style: "normal",
          weight: "400",
        }),
        new FontFace("Hack Nerd Font Mono", `url("${terminalFontBoldUrl}")`, {
          style: "normal",
          weight: "700",
        }),
        new FontFace("Hack Nerd Font", `url("${terminalFontRegularUrl}")`, {
          style: "normal",
          weight: "400",
        }),
        new FontFace("Hack Nerd Font", `url("${terminalFontBoldUrl}")`, {
          style: "normal",
          weight: "700",
        }),
      ];

      const results = await Promise.allSettled(faces.map((face) => face.load()));
      for (const result of results) {
        if (result.status === "fulfilled" && !document.fonts.has(result.value)) {
          document.fonts.add(result.value);
        }
      }

      await Promise.allSettled([
        document.fonts.load(`${MOBILE_TERMINAL_FONT_SIZE}px "Hack Nerd Font Mono"`, NERD_FONT_TEST_GLYPH),
        document.fonts.load(`${MOBILE_TERMINAL_FONT_SIZE}px "Hack Nerd Font"`, NERD_FONT_TEST_GLYPH),
        document.fonts.ready,
      ]);
    })();
  }

  return terminalFontLoadPromise;
}

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
        theme: terminalTheme,
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
        @font-face {
          font-family: "Hack Nerd Font Mono";
          font-style: normal;
          font-weight: 400;
          src: url("${terminalFontRegularUrl}") format("truetype");
        }
        @font-face {
          font-family: "Hack Nerd Font Mono";
          font-style: normal;
          font-weight: 700;
          src: url("${terminalFontBoldUrl}") format("truetype");
        }
        @font-face {
          font-family: "Hack Nerd Font";
          font-style: normal;
          font-weight: 400;
          src: url("${terminalFontRegularUrl}") format("truetype");
        }
        @font-face {
          font-family: "Hack Nerd Font";
          font-style: normal;
          font-weight: 700;
          src: url("${terminalFontBoldUrl}") format("truetype");
        }
        * { box-sizing: border-box; }
        .shell {
          background: #0b0f14;
          height: 100%;
          overflow: hidden;
          padding: 8px 6px;
          position: relative;
          width: 100%;
        }
        .terminal {
          caret-color: #f8fafc;
          height: 100%;
          touch-action: manipulation;
          width: 100%;
        }
        .xterm {
          background: #0b0f14 !important;
          caret-color: #f8fafc;
          font-feature-settings: "liga" 0;
          height: 100%;
          padding: 0 !important;
          -webkit-font-smoothing: antialiased;
        }
        .xterm .xterm-helper-textarea {
          caret-color: #f8fafc !important;
        }
        .xterm-viewport {
          background: #0b0f14 !important;
          overflow-y: hidden !important;
          overscroll-behavior: contain;
        }
        .xterm-screen {
          background: #0b0f14 !important;
          padding: 0 !important;
        }
        .xterm-scrollable-element {
          overscroll-behavior: contain;
          position: relative;
        }
        .xterm-scrollable-element > .scrollbar.vertical,
        .xterm-scrollable-element > .visible.scrollbar.vertical,
        .xterm-scrollable-element > .invisible.scrollbar.vertical {
          bottom: 0 !important;
          left: auto !important;
          position: absolute !important;
          right: 0 !important;
          top: 0 !important;
        }
        .xterm .xterm-scroll-area ~ .xterm-decoration-container + div,
        .xterm-scrollbar,
        .xterm .scrollbar {
          opacity: 0.6 !important;
          right: 2px !important;
          transition: opacity 0.2s ease, width 0.2s ease !important;
          width: 6px !important;
        }
        .xterm .xterm-scroll-area ~ .xterm-decoration-container + div > div,
        .xterm-scrollbar > div,
        .xterm .scrollbar.vertical > div.slider,
        .xterm .invisible.scrollbar > div {
          background: rgba(161, 161, 170, 0.34) !important;
          border-radius: 9999px !important;
          opacity: 1 !important;
          transition: opacity 0.2s ease !important;
          width: 6px !important;
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
