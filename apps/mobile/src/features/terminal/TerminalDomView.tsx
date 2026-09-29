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
  sanitizeNativeOscTitle,
  shouldClearNativeOscOnCmdEnd,
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
import {
  fingerScrollTarget,
  fingerWheelReports,
  pointerMovedFarEnough,
  selectionToolbarHandle,
  terminalCellFromPoint,
  terminalSelectionEnd,
  wordSpanInLine,
} from "@/features/terminal/terminal-pointer";
import type { TerminalSelectionChrome } from "@/features/terminal/terminal-selection-chrome";

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
  dismissSelection: () => void;
};

type Props = {
  connected: boolean;
  onInput: (data: string) => Promise<void>;
  onResize: (cols: number, rows: number) => Promise<void>;
  onReady: (cols: number, rows: number) => Promise<void>;
  onRendererError: (message: string) => Promise<void>;
  onSelectionChrome?: (chrome: TerminalSelectionChrome | null) => Promise<void>;
  onTitleChange: (title: string) => Promise<void>;
  onOscTitleChange?: (title: string | undefined) => Promise<void>;
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

type SelectionCore = {
  _renderService?: {
    dimensions?: {
      css?: {
        cell?: { height?: number; width?: number };
      };
    };
  };
  _selectionService?: {
    _model: {
      isSelectAllActive: boolean;
      selectionEnd?: [number, number];
      selectionStart?: [number, number];
      selectionStartLength: number;
    };
    clearSelection: () => void;
    enable: () => void;
    refresh: (isNewSelection?: boolean) => void;
  };
};

function attachTerminalPointerGestures({
  callbacksRef,
  dismissSelectionRef,
  keyboardArmedRef,
  mount,
  terminal,
}: {
  callbacksRef: {
    current: {
      onSelectionChrome?: (chrome: TerminalSelectionChrome | null) => Promise<void>;
    };
  };
  dismissSelectionRef: { current: (() => void) | null };
  keyboardArmedRef: { current: boolean };
  mount: HTMLDivElement;
  terminal: Terminal;
}): () => void {
  const element = terminal.element;
  const shell = mount.parentElement;
  if (!element || !shell) return () => undefined;

  const core = (terminal as unknown as { _core?: SelectionCore })._core;
  const LONG_PRESS_MS = 480;
  type Cell = [number, number];
  type Gesture =
    | { kind: "pending"; pointerId: number; startX: number; startY: number; timer: number }
    | { kind: "scroll"; pointerId: number; lastY: number; remainder: number }
    | { kind: "held"; pointerId: number }
    | { kind: "adjust"; pointerId: number; edge: "start" | "end" };

  let gesture: Gesture | null = null;
  let range: { start: Cell; end: Cell } | null = null;
  let toolbarEdge: "start" | "end" = "end";
  let anchors: { end: TerminalSelectionChrome["end"]; start: TerminalSelectionChrome["start"] } | null = null;

  const publish = (chrome: TerminalSelectionChrome | null) => {
    anchors = chrome;
    void callbacksRef.current.onSelectionChrome?.(chrome);
  };

  const clearSelection = () => {
    range = null;
    anchors = null;
    toolbarEdge = "end";
    core?._selectionService?.clearSelection();
    publish(null);
  };
  dismissSelectionRef.current = clearSelection;

  let synthesizingClick = false;

  const cellAt = (clientX: number, clientY: number): Cell | null => {
    const screen = element.querySelector(".xterm-screen");
    if (!(screen instanceof HTMLElement)) return null;
    const rect = screen.getBoundingClientRect();
    const cell = core?._renderService?.dimensions?.css?.cell;
    return terminalCellFromPoint({
      cellHeight: cell?.height ?? 0,
      cellWidth: cell?.width ?? 0,
      clientX,
      clientY,
      cols: terminal.cols,
      originX: rect.left,
      originY: rect.top,
      rows: terminal.rows,
      viewportY: terminal.buffer.active.viewportY,
    });
  };

  const cellMetrics = () => {
    const screen = element.querySelector(".xterm-screen");
    if (!(screen instanceof HTMLElement)) return null;
    const width = core?._renderService?.dimensions?.css?.cell?.width ?? 0;
    const height = core?._renderService?.dimensions?.css?.cell?.height ?? 0;
    if (width <= 0 || height <= 0) return null;
    return { height, screen, width };
  };

  const paintSelection = (start: Cell, end: Cell) => {
    const selection = core?._selectionService;
    if (!selection) return;
    selection.enable();
    selection._model.isSelectAllActive = false;
    selection._model.selectionStartLength = 0;
    selection._model.selectionStart = start;
    selection._model.selectionEnd = terminalSelectionEnd(start, end, terminal.cols);
    selection.refresh(true);
  };

  const anchorAt = (column: number, bufferRow: number): TerminalSelectionChrome["start"] => {
    const metrics = cellMetrics();
    if (!metrics) return null;
    const viewportRow = bufferRow - terminal.buffer.active.viewportY;
    if (viewportRow < 0 || viewportRow >= terminal.rows) return null;
    const screenRect = metrics.screen.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    return {
      height: metrics.height,
      x: screenRect.left - shellRect.left + column * metrics.width,
      y: screenRect.top - shellRect.top + viewportRow * metrics.height,
    };
  };

  const placeChrome = (edge: "start" | "end" = toolbarEdge) => {
    if (!range) {
      publish(null);
      return;
    }
    toolbarEdge = edge;
    const exclusiveEnd = terminalSelectionEnd(range.start, range.end, terminal.cols);
    const start = anchorAt(range.start[0], range.start[1]);
    const end = anchorAt(exclusiveEnd[0], exclusiveEnd[1]);
    const anchor = selectionToolbarHandle(start, end, edge);
    publish({
      anchorX: anchor?.x ?? shell.clientWidth / 2,
      anchorY: anchor?.y ?? 48,
      end,
      start,
      text: terminal.getSelection(),
    });
  };

  const hitHandle = (clientX: number, clientY: number): "start" | "end" | null => {
    if (!anchors) return null;
    const shellRect = shell.getBoundingClientRect();
    const x = clientX - shellRect.left;
    const y = clientY - shellRect.top;
    const near = (handle: TerminalSelectionChrome["start"]) => {
      if (!handle) return Number.POSITIVE_INFINITY;
      const dx = x - handle.x;
      const withinY = y >= handle.y - 22 && y <= handle.y + handle.height + 22;
      if (!withinY || Math.abs(dx) > 22) return Number.POSITIVE_INFINITY;
      return Math.abs(dx) + Math.abs(y - (handle.y + handle.height / 2));
    };
    const startDistance = near(anchors.start);
    const endDistance = near(anchors.end);
    const closest = Math.min(startDistance, endDistance);
    if (!Number.isFinite(closest)) return null;
    return startDistance <= endDistance ? "start" : "end";
  };

  const applyRange = (start: Cell, end: Cell, edge: "start" | "end" = toolbarEdge) => {
    const forward = end[1] > start[1] || (end[1] === start[1] && end[0] >= start[0]);
    range = forward ? { start, end } : { start: end, end: start };
    paintSelection(range.start, range.end);
    placeChrome(edge);
  };

  const selectWord = (cell: Cell) => {
    const line = terminal.buffer.active.getLine(cell[1])?.translateToString(true) ?? "";
    const span = wordSpanInLine(line, cell[0]);
    applyRange([span.start, cell[1]], [Math.max(span.start, span.end - 1), cell[1]]);
  };

  const dispatchApplicationWheels = (clientX: number, clientY: number, count: number, deltaY: -1 | 1) => {
    for (let index = 0; index < count; index += 1) {
      element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          deltaMode: 1,
          deltaX: 0,
          deltaY,
          view: window,
        }),
      );
    }
  };

  const scrollBy = (dy: number, remainder: number, clientX: number, clientY: number) => {
    const height = core?._renderService?.dimensions?.css?.cell?.height ?? 0;
    if (height <= 0) return remainder;
    const next = remainder + dy;
    let lines = Math.trunc(next / height);
    if (lines === 0) return next;

    const target = fingerScrollTarget({
      bufferType: terminal.buffer.active.type,
      mouseTrackingMode: terminal.modes.mouseTrackingMode,
    });
    if (target === "application") {
      const reports = fingerWheelReports(lines);
      if (!reports) return next;
      dispatchApplicationWheels(clientX, clientY, reports.count, reports.deltaY);
      lines = reports.appliedLines;
    } else {
      terminal.scrollLines(-lines);
      placeChrome();
    }
    return next - lines * height;
  };

  const dispatchClick = (clientX: number, clientY: number) => {
    const init: MouseEventInit = {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX,
      clientY,
      view: window,
    };
    synthesizingClick = true;
    element.dispatchEvent(new MouseEvent("mousedown", init));
    element.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
    synthesizingClick = false;
  };

  const blockUnarmedMouse = (event: MouseEvent) => {
    if (synthesizingClick) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const edge = hitHandle(event.clientX, event.clientY);
    if (edge && range) {
      event.preventDefault();
      event.stopPropagation();
      gesture = { edge, kind: "adjust", pointerId: event.pointerId };
      return;
    }
    if (target?.closest(".scrollbar")) return;
    if (!element.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const timer = window.setTimeout(() => {
      if (!gesture || gesture.kind !== "pending" || gesture.pointerId !== event.pointerId) return;
      const cell = cellAt(gesture.startX, gesture.startY);
      gesture = { kind: "held", pointerId: event.pointerId };
      if (cell) selectWord(cell);
    }, LONG_PRESS_MS);
    gesture = {
      kind: "pending",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
    element.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.kind === "held") return;
    if (gesture.kind === "adjust") {
      event.preventDefault();
      const cell = cellAt(event.clientX, event.clientY);
      if (!cell || !range) return;
      const start = gesture.edge === "start" ? cell : range.start;
      const end = gesture.edge === "end" ? cell : range.end;
      const forward = end[1] > start[1] || (end[1] === start[1] && end[0] >= start[0]);
      gesture.edge = forward ? gesture.edge : gesture.edge === "start" ? "end" : "start";
      applyRange(start, end, gesture.edge);
      const metrics = cellMetrics();
      if (metrics) {
        const rect = metrics.screen.getBoundingClientRect();
        if (event.clientY < rect.top + metrics.height) terminal.scrollLines(-1);
        else if (event.clientY > rect.bottom - metrics.height) terminal.scrollLines(1);
        placeChrome();
      }
      return;
    }
    if (gesture.kind === "pending") {
      if (!pointerMovedFarEnough(event.clientX - gesture.startX, event.clientY - gesture.startY)) return;
      window.clearTimeout(gesture.timer);
      gesture = { kind: "scroll", lastY: event.clientY, pointerId: event.pointerId, remainder: 0 };
    }
    if (gesture.kind !== "scroll") return;
    event.preventDefault();
    gesture.remainder = scrollBy(
      event.clientY - gesture.lastY,
      gesture.remainder,
      event.clientX,
      event.clientY,
    );
    gesture.lastY = event.clientY;
  };

  const finishGesture = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const active = gesture;
    gesture = null;
    if (active.kind === "pending") {
      window.clearTimeout(active.timer);
      clearSelection();
      dispatchClick(active.startX, active.startY);
      return;
    }
    if (active.kind === "adjust") placeChrome();
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.kind === "pending") window.clearTimeout(gesture.timer);
    gesture = null;
  };

  const stopBrowserClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  shell.addEventListener("pointerdown", onPointerDown, true);
  shell.addEventListener("pointermove", onPointerMove, true);
  shell.addEventListener("pointerup", finishGesture, true);
  shell.addEventListener("pointercancel", onPointerCancel, true);
  element.addEventListener("mousedown", blockUnarmedMouse, true);
  element.addEventListener("mousemove", blockUnarmedMouse, true);
  element.addEventListener("mouseup", blockUnarmedMouse, true);
  element.addEventListener("click", stopBrowserClick, true);

  return () => {
    if (gesture?.kind === "pending") window.clearTimeout(gesture.timer);
    dismissSelectionRef.current = null;
    shell.removeEventListener("pointerdown", onPointerDown, true);
    shell.removeEventListener("pointermove", onPointerMove, true);
    shell.removeEventListener("pointerup", finishGesture, true);
    shell.removeEventListener("pointercancel", onPointerCancel, true);
    element.removeEventListener("mousedown", blockUnarmedMouse, true);
    element.removeEventListener("mousemove", blockUnarmedMouse, true);
    element.removeEventListener("mouseup", blockUnarmedMouse, true);
    element.removeEventListener("click", stopBrowserClick, true);
    keyboardArmedRef.current = false;
  };
}

export default function TerminalDomView({
  connected,
  onInput,
  onReady,
  onRendererError,
  onResize,
  onSelectionChrome,
  theme,
  onTitleChange,
  onOscTitleChange,
  ref,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const callbacksRef = useRef({ onInput, onReady, onRendererError, onResize, onSelectionChrome, onTitleChange, onOscTitleChange });
  const dismissSelectionRef = useRef<(() => void) | null>(null);
  const cmdStartTimerRef = useRef<number | null>(null);
  const connectedRef = useRef(connected);
  const keyboardArmedRef = useRef(false);
  const lastTitleRef = useRef<string | null>(null);
  const lastOscTitleRef = useRef<string | undefined>(undefined);
  const suppressResizeReportRef = useRef(false);

  connectedRef.current = connected;
  callbacksRef.current = { onInput, onReady, onRendererError, onResize, onSelectionChrome, onTitleChange, onOscTitleChange };

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
        reflowCursorLine: false,
        scrollback: 10000,
        smoothScrollDuration: 0,
        theme,
      });
      const fitAddon = new FitAddon();
      const unicode11Addon = new Unicode11Addon();

      terminal.loadAddon(unicode11Addon);
      terminal.unicode.activeVersion = "11";
      terminal.loadAddon(fitAddon);
      terminal.open(mount);
      let webglAddon: WebglAddon | null = null;
      try {
        const addon = new WebglAddon(true);
        terminal.loadAddon(addon);
        webglAddon = addon;
        addon.onContextLoss(() => {
          addon.dispose();
          if (webglAddon === addon) webglAddon = null;
        });
      } catch (error) {
        console.warn("WebGL addon failed to load, using canvas renderer", error);
      }
      const textarea = terminal.textarea;
      if (textarea) {
        textarea.autocapitalize = "none";
        textarea.readOnly = true;
        textarea.spellcheck = false;
        textarea.setAttribute("autocomplete", "off");
        textarea.setAttribute("autocorrect", "off");
        textarea.setAttribute("inputmode", "none");
        const focusTextarea = textarea.focus.bind(textarea);
        textarea.focus = () => {
          if (!keyboardArmedRef.current) {
            textarea.readOnly = true;
            textarea.setAttribute("inputmode", "none");
            return;
          }
          textarea.readOnly = false;
          textarea.setAttribute("inputmode", "text");
          focusTextarea();
        };
        textarea.addEventListener("blur", () => {
          keyboardArmedRef.current = false;
          textarea.readOnly = true;
          textarea.setAttribute("inputmode", "none");
        });
      }

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      const detachPointer = attachTerminalPointerGestures({
        callbacksRef,
        dismissSelectionRef,
        keyboardArmedRef,
        mount,
        terminal,
      });

      const reportSize = () => {
        if (suppressResizeReportRef.current) return;
        void callbacksRef.current.onResize(terminal.cols, terminal.rows).catch(reportError);
      };
      const fitAndReport = () => {
        try {
          const previousCols = terminal.cols;
          const previousRows = terminal.rows;
          fitAddon.fit();
          scrollTerminalToBottom(terminal);
          if (terminal.cols === previousCols && terminal.rows === previousRows) {
            reportSize();
          }
        } catch (error) {
          reportError(error);
        }
      };

      let pendingInput = "";
      let inputScheduled = false;
      const flushInput = () => {
        inputScheduled = false;
        const data = pendingInput;
        pendingInput = "";
        if (!data) return;
        void callbacksRef.current.onInput(data).catch(reportError);
      };
      const onData = terminal.onData((data) => {
        pendingInput += data;
        if (inputScheduled) return;
        inputScheduled = true;
        queueMicrotask(flushInput);
      });
      const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
        if (suppressResizeReportRef.current) return;
        void callbacksRef.current.onResize(cols, rows).catch(reportError);
      });

      const emitOscTitle = (raw: string | undefined) => {
        const next = sanitizeNativeOscTitle(raw) || undefined;
        if (next === lastOscTitleRef.current) return;
        lastOscTitleRef.current = next;
        const handler = callbacksRef.current.onOscTitleChange;
        if (handler) void handler(next).catch(reportError);
      };
      const titleChangeDisposable = terminal.onTitleChange((raw) => {
        emitOscTitle(raw);
      });

      const CMD_START_DELAY_MS = 150;
      // 9999 = shell shim; 9998 = server reattach title inject (title only).
      const registerTitleOsc = (osc: number) => {
        terminal.parser.registerOscHandler(osc, (data: string) => {
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
            // Real shell (9999) idle clears native OSC topics (APP-047).
            // Reattach inject (9998) must keep them across refresh.
            if (shouldClearNativeOscOnCmdEnd(osc)) {
              emitOscTitle(undefined);
            }
            const nextTitle = shortenPath(payload);
            if (nextTitle !== lastTitleRef.current) {
              lastTitleRef.current = nextTitle;
              void callbacksRef.current.onTitleChange(nextTitle).catch(reportError);
            }
          }

          return true;
        });
      };
      registerTitleOsc(9998);
      registerTitleOsc(9999);

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
        detachPointer();
        resizeObserver?.disconnect();
        titleChangeDisposable.dispose();
        pendingInput = "";
        onData.dispose();
        onResizeDisposable.dispose();
        webglAddon?.dispose();
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
        keyboardArmedRef.current = false;
        const textarea = terminalRef.current?.textarea;
        if (textarea) {
          textarea.readOnly = true;
          textarea.setAttribute("inputmode", "none");
        }
        terminalRef.current?.blur();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return true;
      },
      clear: () => {
        terminalRef.current?.clear();
        return true;
      },
      dismissSelection: () => {
        dismissSelectionRef.current?.();
        return true;
      },
      fit: () => {
        const terminal = terminalRef.current;
        const fitAddon = fitAddonRef.current;
        if (!terminal || !fitAddon || suppressResizeReportRef.current) return true;
        try {
          const previousCols = terminal.cols;
          const previousRows = terminal.rows;
          fitAddon.fit();
          scrollTerminalToBottom(terminal);
          if (terminal.cols === previousCols && terminal.rows === previousRows) {
            void callbacksRef.current.onResize(terminal.cols, terminal.rows);
          }
        } catch {
          // The next layout pass retries.
        }
        return true;
      },
      focus: () => {
        keyboardArmedRef.current = true;
        const textarea = terminalRef.current?.textarea;
        if (textarea) {
          textarea.readOnly = false;
          textarea.setAttribute("inputmode", "text");
        }
        terminalRef.current?.focus();
        return true;
      },
      insertText: (...args: DomJsonValue[]) => {
        const text = typeof args[0] === "string" ? args[0] : "";
        const submit = args[1] === true;
        const data = `${text}${submit ? "\r" : ""}`;
        terminalRef.current?.input(data, false);
        return true;
      },
      restoreSnapshot: (...args: DomJsonValue[]) => {
        const snapshot = args[0] as TerminalSnapshot;
        const terminal = terminalRef.current;
        if (!terminal || !isTerminalSnapshot(snapshot)) return true;
        const { payload, useAlternateScreen } = buildTerminalSnapshotRestorePayload(snapshot);
        terminal.reset();
        // Replay against the captured grid so full-width rows stay intact, then
        // fit the phone viewport. The snapshot size is the previous desktop client.
        suppressResizeReportRef.current = true;
        try {
          if (isUsableTerminalGrid(snapshot.cols, snapshot.rows)) {
            terminal.resize(snapshot.cols, snapshot.rows);
          }
          terminal.write(payload, () => {
            suppressResizeReportRef.current = false;
            try {
              fitAddonRef.current?.fit();
            } catch {
              // The layout observer retries.
            }
            if (!useAlternateScreen) terminal.scrollToBottom();
            void callbacksRef.current.onResize(terminal.cols, terminal.rows);
          });
        } catch {
          suppressResizeReportRef.current = false;
        }
        return true;
      },
      sendSequence: (...args: DomJsonValue[]) => {
        const sequence = typeof args[0] === "string" ? args[0] : "";
        terminalRef.current?.input(sequence, false);
        return true;
      },
      writeBase64: (...args: DomJsonValue[]) => {
        const chunks = Array.isArray(args[0]) ? args[0].filter((chunk): chunk is string => typeof chunk === "string") : [];
        const terminal = terminalRef.current;
        if (!terminal) return true;
        for (const [index, chunk] of chunks.entries()) {
          terminal.write(
            base64ToBytes(chunk),
            index === chunks.length - 1 ? () => scrollTerminalToBottom(terminal) : undefined,
          );
        }
        return true;
      },
      writeText: (...args: DomJsonValue[]) => {
        const text = typeof args[0] === "string" ? args[0] : "";
        terminalRef.current?.write(text);
        return true;
      },
    }),
    [],
  );

  return (
    <div className="shell" data-connected={connected ? "true" : "false"}>
      <div ref={mountRef} className="terminal" />
      <style>{buildTerminalDomCss(theme)}</style>
    </div>
  );
}
