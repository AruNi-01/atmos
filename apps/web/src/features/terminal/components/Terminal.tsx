"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ImageAddon } from "@xterm/addon-image";
import { useTheme } from "next-themes";

import "@xterm/xterm/css/xterm.css";
import "./terminal-grid.css";

import { defaultTerminalOptions, atmosDarkTheme, atmosLightTheme, terminalFont } from "../lib/theme";
import { useTerminalWebSocket } from "../hooks/use-terminal-websocket";
import type { TerminalProps, TerminalSnapshot } from "../types/index";
import { getRuntimeApiConfig, wsBase } from "@/shared/lib/desktop-runtime";
import { createTerminalLinkProvider } from "../lib/terminal-link-routing";
import {
  DISABLE_TUI_MOUSE_TRACKING,
  ENABLE_TUI_MOUSE_TRACKING,
  mouseTrackingRestoreSequence,
  SafeClipboardProvider,
  cloneTerminalWriteChunk,
  coalesceTerminalWriteChunks,
  ensureTerminalFontsLoaded,
  extractCommandName,
  isFindShortcut,
  isInlineMouseTuiCommand,
  isTerminalContainerVisible,
  markTerminalSessionLive,
  scheduleTerminalSessionDead,
  wasTerminalSessionLive,
  isTerminalEmulatorReport,
  isUsableTerminalGrid,
  jumpXtermToBottom,
  normalizeSnapshotData,
  shiftEnterInput,
  shortenPath,
  type TerminalWriteChunk,
  wrapBracketedPaste,
  writeXtermPayload,
} from "../lib/terminal-runtime-utils";
import {
  attachTuiMouseWheelMultiplier,
  isTerminalMouseTrackingActive,
  shouldDisableTuiMouseOnCmdEnd,
} from "../lib/tui-mouse-wheel";
import { createTerminalInputCoalesceQueue } from "../lib/terminal-input-coalesce";
import { TerminalChrome } from "./TerminalChrome";
import { TerminalSelectionToolbar } from "./TerminalSelectionToolbar";
import { buildTerminalWsUrl } from "../lib/terminal-ws-url";
import { useTerminalInputReady } from "../hooks/use-terminal-input-ready";
import { useTerminalLinks } from "../hooks/use-terminal-links";
import { useTerminalSearch } from "../hooks/use-terminal-search";
import {
  createOpaqueId,
  normalizeTerminalSelectionText,
} from "../lib/terminal-ai-context-protocol";
import type { TerminalSelectionSnapshot } from "../types";
import { createAgentHookInterruptInference } from "@/features/agent/lib/agent-hook-interrupt-inference";
import { useAgentHooksStore } from "@/features/agent/store/agent-hooks-store";
import {
  isShellPreexecCommandOscTitle,
  nextOscTitleAfterIncoming,
} from "@atmos/shared/terminal";

export interface TerminalRef {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  write: (data: string) => void;
  sendText: (data: string) => void;
  sendEnter: () => void;
  getCursorClientPoint: () => { x: number; y: number } | null;
  scrollToBottom: () => void;
  /** Subscribe to decoded PTY output for agent readiness heuristics. */
  subscribeOutput: (listener: (data: string) => void) => () => void;
  /** Paste clipboard content into the terminal */
  paste: () => Promise<void>;
  /** Destroy the terminal session (kills tmux window) */
  destroy: () => void;
  /** Last N lines of the xterm buffer, optionally skipping lines already read from the bottom. */
  getScreenText: (maxLines: number, skipFromBottom?: number) => string;
}

// tldraw / mosaic can report a usable but transient terminal grid while a new
// pane is still being inserted. Pin tmux only after the first fit settles.
const INITIAL_CONNECT_MIN_FRAMES = 2;
const INITIAL_CONNECT_STABLE_FRAMES = 2;
const INITIAL_CONNECT_MAX_WAIT_FRAMES = 20;
const CANVAS_TERMINAL_SCALE_FIT_DEBOUNCE_MS = 300;

function fitTerminalPreservingScroll(
  term: XTerm,
  fit: FitAddon,
): { cols: number; rows: number; changed: boolean } {
  const prevCols = term.cols;
  const prevRows = term.rows;
  const before = term.buffer.active;
  const wasAtBottom = before.viewportY >= before.baseY;
  const distanceFromBottom = Math.max(0, before.baseY - before.viewportY);

  fit.fit();

  if (wasAtBottom) {
    jumpXtermToBottom(term);
  } else {
    const after = term.buffer.active;
    term.scrollToLine(Math.max(0, after.baseY - distanceFromBottom));
  }

  return {
    cols: term.cols,
    rows: term.rows,
    changed: term.cols !== prevCols || term.rows !== prevRows,
  };
}

/** Hide local xterm cursor (DEC private mode 25). Inline TUIs (Grok) paint in
 * the normal buffer; a brief clear/redraw would otherwise flash the theme's
 * underline cursor as `_` at home before the app repaints. */
function hideLocalXtermCursor(term: XTerm) {
  term.write("\x1b[?25l");
}

const Terminal = ({
  sessionId,
  workspaceId,
  className,
  tmuxWindowName,
  projectName,
  workspaceName,
  terminalName,
  terminalKind,
  sideChatId,
  sourcePaneId,
  sourceTmuxWindowName,
  isNewPane,
  onSessionReady,
  onSessionClose,
  onSessionError,
  noTmux,
  cwd,
  projectRootPath,
  onData, // New prop
  readOnly,
  terminalScale,
  onInputWhileReadOnly,
  onTitleChange,
  onOscTitleChange,
  onSelectionSnapshotChange,
  onAddSelectionAsContext,
  onStartSideChatForSelection,
  surfaceActive = true,
  ref,
}: TerminalProps & { ref?: React.Ref<TerminalRef>; onInputWhileReadOnly?: () => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchResultsListenerRef = useRef<{ dispose: () => void } | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeRafIdRef = useRef(0);
  const resizeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readOnlyRef = useRef(readOnly);
  // Authoritative off-screen gate from host (warm frame / inactive tab). Prefer
  // this over reading layout so hop does not force reflow for hidden xterms.
  const surfaceActiveRef = useRef(surfaceActive);
  surfaceActiveRef.current = surfaceActive;
  // Keep title callbacks in sync to avoid stale closures in OSC handlers
  const onTitleChangeRef = useRef(onTitleChange);
  useEffect(() => { onTitleChangeRef.current = onTitleChange; });
  const onOscTitleChangeRef = useRef(onOscTitleChange);
  useEffect(() => { onOscTitleChangeRef.current = onOscTitleChange; });
  const lastOscTitleRef = useRef<string | undefined>(undefined);
  const onSelectionSnapshotChangeRef = useRef(onSelectionSnapshotChange);
  useEffect(() => { onSelectionSnapshotChangeRef.current = onSelectionSnapshotChange; });
  const sourceSessionIdRef = useRef(sessionId);
  const sourceTmuxWindowNameRef = useRef(tmuxWindowName);
  const workspaceIdRef = useRef(workspaceId);
  const interruptInferenceRef = useRef<ReturnType<
    typeof createAgentHookInterruptInference
  > | null>(null);
  useEffect(() => {
    sourceSessionIdRef.current = sessionId;
    sourceTmuxWindowNameRef.current = tmuxWindowName;
    workspaceIdRef.current = workspaceId;
  }, [sessionId, tmuxWindowName, workspaceId]);

  // Infer agent-hook idle when the user interrupts (Ctrl+C / Escape) but the
  // agent never posts a terminal Stop/SessionEnd hook.
  useEffect(() => {
    const inference = createAgentHookInterruptInference({
      getStablePaneId: () => {
        const windowName = sourceTmuxWindowNameRef.current;
        const wsId = workspaceIdRef.current;
        if (!windowName || !wsId) return null;
        return `${wsId}:${windowName}`;
      },
      getSession: (id) => useAgentHooksStore.getState().sessions.get(id),
      forceSessionIdle: (id) => {
        void useAgentHooksStore.getState().forceSessionIdle(id);
      },
    });
    interruptInferenceRef.current = inference;
    return () => {
      inference.dispose();
      if (interruptInferenceRef.current === inference) {
        interruptInferenceRef.current = null;
      }
    };
  }, []);

  // Track last emitted title and pending CMD_START timer for debounce/dedup
  const lastTitleRef = useRef<string>("");
  const cmdStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot asked for TUI mouse; used by real shell CMD_START belt-and-suspenders.
  const tuiMouseDesiredRef = useRef(false);
  const lastMouseRestoreSequenceRef = useRef("");
  // Debounce native OSC 0/2 so shell preexec (`ls`) → precmd (path) never paints.
  const oscSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOscRawRef = useRef<string | undefined>(undefined);
  const terminalInputCleanupRef = useRef<(() => void) | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [selectionSnapshot, setSelectionSnapshot] = useState<TerminalSelectionSnapshot | null>(null);
  const lastSelectionAnchorRef = useRef<{ x: number; y: number } | null>(null);
  // Prefer "connected" when this session was already live (warm remount / tab re-show)
  // so the full-screen Connecting overlay does not flash.
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "disconnected" | "error">(
    () => (wasTerminalSessionLive(sessionId) ? "connected" : "connecting"),
  );
  const [attachError, setAttachError] = useState<string | null>(null);
  // One-shot auto-create after attach NotFound (missing tmux window). Avoids
  // looping if create also fails.
  const missingWindowCreateAttemptedRef = useRef(false);
  // Ref to hold sendResize so handleConnected can call it without circular dependency
  const sendResizeRef = useRef<(size: { cols: number; rows: number }) => void>(() => {});
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const currentTheme = isDark ? atmosDarkTheme : atmosLightTheme;
  const isCanvasScaledTerminal = terminalScale != null;
  const normalizedTerminalScale =
    typeof terminalScale === "number" && Number.isFinite(terminalScale) && terminalScale > 0
      ? terminalScale
      : 1;
  const [appliedTerminalScale, setAppliedTerminalScale] = useState(normalizedTerminalScale);
  const scaledTerminalFontSize = Math.max(2, terminalFont.size * appliedTerminalScale);
  const normalizedTerminalScaleRef = useRef(normalizedTerminalScale);
  const appliedTerminalScaleRef = useRef(appliedTerminalScale);
  const outputListenersRef = useRef(new Set<(data: string) => void>());
  const {
    resetInputReady,
    scheduleInputReady,
    scheduleInputReadyFallback,
  } = useTerminalInputReady({ onSessionReady, sessionId });
  const {
    closeSearch,
    handleSearchQueryChange,
    isSearchVisible,
    openSearch,
    runSearch,
    searchHasMatch,
    searchInputRef,
    searchQuery,
    searchStats,
    setSearchStats,
    terminalSearchInputId,
  } = useTerminalSearch({ isDark, searchAddonRef, terminalRef });
  // SearchAddon selects matches for highlighting; suppress the selection toolbar while find is open.
  const isSearchVisibleRef = useRef(isSearchVisible);
  const {
    handleResolvedLinkRef,
    handleTerminalLinkRef,
    updatePointerModifierState,
  } = useTerminalLinks({
    containerRef,
    cwd,
    projectRootPath,
    terminalRef,
    workspaceId,
  });

  const wsUrl = buildTerminalWsUrl({
    cwd,
    isNewPane,
    noTmux,
    projectName,
    sessionId,
    sideChatId,
    sourcePaneId,
    sourceTmuxWindowName,
    terminalKind,
    terminalName,
    tmuxWindowName,
    workspaceId,
    workspaceName,
  });

  // Batch terminal writes via rAF to reduce render passes. Keep websocket
  // binary frames as bytes so xterm.js owns the streaming UTF-8 parser; tmux
  // control mode can split multi-byte glyphs across arbitrary notifications.
  // APP-054: small interactive bursts (TUI redraw frames) bypass rAF when the
  // pipeline is empty so wheel-driven updates paint with less added delay.
  const pendingWriteRef = useRef<TerminalWriteChunk[]>([]);
  const rafScheduledRef = useRef(false);
  const outputTextDecoderRef = useRef(new TextDecoder());
  const INTERACTIVE_OUTPUT_FAST_PATH_MAX = 512;

  const handleOutput = useCallback((data: string | Uint8Array) => {
    if (data.length > 0) {
      const term = terminalRef.current;
      const canFastPath =
        term &&
        !rafScheduledRef.current &&
        pendingWriteRef.current.length === 0 &&
        data.length > 0 &&
        data.length <= INTERACTIVE_OUTPUT_FAST_PATH_MAX;

      if (canFastPath) {
        term.write(cloneTerminalWriteChunk(data));
      } else {
        pendingWriteRef.current.push(cloneTerminalWriteChunk(data));
        if (!rafScheduledRef.current) {
          rafScheduledRef.current = true;
          requestAnimationFrame(() => {
            rafScheduledRef.current = false;
            const pending = pendingWriteRef.current;
            pendingWriteRef.current = [];
            const active = terminalRef.current;
            if (pending.length > 0 && active) {
              for (const chunk of coalesceTerminalWriteChunks(pending)) {
                active.write(chunk);
              }
            }
          });
        }
      }
    }
    if (data.length > 0 && status === "connected") {
      scheduleInputReady();
    }
    const text =
      typeof data === "string"
        ? data
        : outputTextDecoderRef.current.decode(data, { stream: true });
    if (text) {
      onData?.(text); // Forward decoded text for parent features (e.g. URL detection)
      for (const listener of outputListenersRef.current) {
        listener(text);
      }
    }
  }, [onData, scheduleInputReady, status]);

  const handleConnected = useCallback(() => {
    markTerminalSessionLive(sessionId);
    setAttachError(null);
    setStatus("connected");
    outputTextDecoderRef.current = new TextDecoder();
    resetInputReady();

    // Re-fit before sending the post-connect size so full-screen TUIs see the
    // browser's current grid, not the constructor's default 80x24 grid.
    // Skip measure/fit while the host frame is off-screen (warm keep-alive).
    if (
      surfaceActiveRef.current &&
      terminalRef.current &&
      fitAddonRef.current &&
      isTerminalContainerVisible(containerRef.current)
    ) {
      const { cols, rows, changed } = fitTerminalPreservingScroll(
        terminalRef.current,
        fitAddonRef.current,
      );
      if (changed) {
        sendResizeRef.current({ cols, rows });
      }
    }
    scheduleInputReadyFallback();
  }, [resetInputReady, scheduleInputReadyFallback, sessionId]);

  const handleDisconnected = useCallback(() => {
    // Grace clear so warm remount within ~2s does not flash Connecting overlay.
    scheduleTerminalSessionDead(sessionId);
    // Keep attach/create error UI after the socket closes — otherwise a brief
    // "error" flash is replaced by a generic Disconnected badge and Retry is lost.
    setStatus((prev) => (prev === "error" ? prev : "disconnected"));
    resetInputReady();
    onSessionClose?.(sessionId);
  }, [resetInputReady, sessionId, onSessionClose]);

  // Filled after handleCreateNew is defined — attach NotFound auto-recovers
  // via create (same window name; backend attach-if-exists).
  const recoverMissingWindowRef = useRef<(() => void) | null>(null);

  const handleError = useCallback(
    (error: string) => {
      onSessionError?.(sessionId, error);

      // Canvas/center refresh can leave a stored window name that no longer
      // exists in tmux (layout saved before first attach, or window killed).
      // Backend create is idempotent for the same name (attach-if-exists), so
      // auto-recover once instead of parking on "4 not found".
      const missingWindow =
        !isNewPane &&
        !noTmux &&
        !missingWindowCreateAttemptedRef.current &&
        /tmux window with name/i.test(error) &&
        /not found/i.test(error);
      if (missingWindow) {
        missingWindowCreateAttemptedRef.current = true;
        setAttachError(null);
        setStatus("connecting");
        // Defer so the failed socket teardown runs first.
        window.setTimeout(() => recoverMissingWindowRef.current?.(), 0);
        return;
      }

      // Surface attach/create failures so the user can manually retry instead of
      // being left on a blank "connecting" or silent disconnected state.
      setAttachError(error);
      setStatus("error");
      resetInputReady();
    },
    [isNewPane, noTmux, onSessionError, resetInputReady, sessionId],
  );

  const handleAttached = useCallback((snapshot?: TerminalSnapshot | null) => {
    markTerminalSessionLive(sessionId);
    setAttachError(null);
    setStatus("connected");
    const term = terminalRef.current;
    if (!term || !snapshot) {
      scheduleInputReady();
      return;
    }

    pendingWriteRef.current = [];
    outputTextDecoderRef.current = new TextDecoder();
    const useAlternateScreen = snapshot.alternate === true;
    // capture-pane restores cells, not DEC mouse modes. Prefer the exact
    // sequence observed on the live stream; fall back to flag / alternate
    // heuristic with the full default (includes 1003 hover).
    const mouseRestore = mouseTrackingRestoreSequence(snapshot);
    const screenMode = useAlternateScreen ? "\x1b[?1049h" : "\x1b[?1049l";
    // Always erase display; clear scrollback for non-alt. Inline mouse TUIs
    // (Grok) paint in the normal buffer — after replaying cells, clear
    // scrollback again so older backends that still ship long history do not
    // leave multi-viewport junk under the TUI (APP-054).
    const clearScrollback = useAlternateScreen ? "" : "\x1b[3J";
    const postHydrateScrollbackClear =
      !useAlternateScreen && mouseRestore.length > 0 ? "\x1b[3J" : "";
    const clearScreen = `${screenMode}\x1b[H\x1b[2J${clearScrollback}`;
    const data = normalizeSnapshotData(snapshot.data);
    const cursorRestore = `\x1b[${snapshot.cursor_y + 1};${snapshot.cursor_x + 1}H`;
    // Authoritative mouse for reattach is the snapshot sequence. Synthetic
    // reattach title uses OSC 9998 (title-only) so it cannot race-clear modes.
    tuiMouseDesiredRef.current = mouseRestore.length > 0;
    lastMouseRestoreSequenceRef.current = mouseRestore;
    term.reset();
    if (
      isUsableTerminalGrid(snapshot.cols, snapshot.rows) &&
      (term.cols !== snapshot.cols || term.rows !== snapshot.rows)
    ) {
      term.resize(snapshot.cols, snapshot.rows);
    }
    // tmux `capture-pane -N` preserves trailing spaces so background-coloured
    // TUI panels survive reconnect. Replay them with autowrap disabled so a
    // full-width captured row does not create an extra wrapped line in xterm.js.
    // Hide local cursor for inline mouse TUIs so a repaint never flashes `_` at 0,0.
    const hideCursor = mouseRestore.length > 0 && !useAlternateScreen ? "\x1b[?25l" : "";
    const payload = `${clearScreen}\x1b[?7l${data}\x1b[?7h\x1b[0m${cursorRestore}${postHydrateScrollbackClear}${mouseRestore}${hideCursor}`;
    writeXtermPayload(term, payload, () => {
      if (!useAlternateScreen) {
        jumpXtermToBottom(term);
      }
      const host = containerRef.current?.parentElement ?? containerRef.current;
      host?.classList.toggle(
        "atmos-tui-mouse-active",
        isTerminalMouseTrackingActive(term) || mouseRestore.length > 0,
      );
      scheduleInputReady();
    });
  }, [scheduleInputReady, sessionId]);

  const { isConnected, isReconnecting, sendInput, sendEnter, sendTerminalReport, sendResize, sendDestroy, connect, disconnect } =
    useTerminalWebSocket({
      url: wsUrl,
      sessionId,
      workspaceId,
      onOutput: handleOutput,
      onConnected: handleConnected,
      onDisconnected: handleDisconnected,
      onError: handleError,
      onAttached: handleAttached,
    });

  const handleRetryAttach = useCallback(() => {
    setAttachError(null);
    setStatus("connecting");
    disconnect();
    // Fresh connect after a failed attach; backend already retried a few times.
    connect();
  }, [connect, disconnect]);

  const handleCreateNew = useCallback(() => {
    setAttachError(null);
    setStatus("connecting");
    disconnect();
    // Create a new tmux window instead of re-attaching the missing one so the
    // user is not stuck when the stored window no longer exists.
    const createUrl = buildTerminalWsUrl({
      cwd,
      isNewPane: true,
      noTmux,
      projectName,
      sessionId,
      sideChatId,
      sourcePaneId,
      sourceTmuxWindowName,
      terminalKind,
      terminalName: terminalName || tmuxWindowName,
      tmuxWindowName,
      workspaceId,
      workspaceName,
    });
    connect(createUrl);
  }, [
    connect,
    cwd,
    disconnect,
    noTmux,
    projectName,
    sessionId,
    sideChatId,
    sourcePaneId,
    sourceTmuxWindowName,
    terminalKind,
    terminalName,
    tmuxWindowName,
    workspaceId,
    workspaceName,
  ]);

  recoverMissingWindowRef.current = handleCreateNew;

  // Keep refs in sync (breaks circular dependencies with handleConnected)
  useEffect(() => {
    sendResizeRef.current = sendResize;
  });

  // Prefer live WS / recent-live session marker over "connecting" so warm re-show
  // does not flash the full-screen Connecting overlay (use light reconnecting if mid-handshake).
  const uiStatus =
    status === "error"
      ? "error"
      : isReconnecting
        ? "reconnecting"
        : isConnected
          ? "connected"
          : status === "connecting" && wasTerminalSessionLive(sessionId)
            ? "reconnecting"
            : status;

  const setCurrentSelectionSnapshot = useCallback((snapshot: TerminalSelectionSnapshot | null) => {
    setSelectionSnapshot(snapshot);
    onSelectionSnapshotChangeRef.current?.(snapshot);
  }, []);

  // SearchAddon selects matches for highlighting; suppress the selection toolbar while find is open.
  useEffect(() => {
    isSearchVisibleRef.current = isSearchVisible;
    if (isSearchVisible) {
      setCurrentSelectionSnapshot(null);
    }
  }, [isSearchVisible, setCurrentSelectionSnapshot]);

  const getCursorClientPoint = useCallback(() => {
    const terminal = terminalRef.current;
    const container = containerRef.current;
    if (!terminal || !container || terminal.cols <= 0 || terminal.rows <= 0) {
      return null;
    }

    const renderedCursor = container.querySelector<HTMLElement>(".xterm-cursor");
    if (renderedCursor) {
      const cursorRect = renderedCursor.getBoundingClientRect();
      if (cursorRect.width > 0 && cursorRect.height > 0) {
        return {
          x: cursorRect.left,
          y: cursorRect.top + cursorRect.height / 2,
        };
      }
    }

    const screen =
      container.querySelector<HTMLElement>(".xterm-screen") ??
      container.querySelector<HTMLElement>(".xterm-rows") ??
      container.querySelector<HTMLElement>(".xterm");
    if (!screen) return null;

    const rect = screen.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const buffer = terminal.buffer.active;
    const dimensions = (
      terminal as typeof terminal & {
        _core?: {
          _renderService?: {
            dimensions?: {
              css?: {
                cell?: {
                  width?: number;
                  height?: number;
                };
              };
            };
          };
        };
      }
    )._core?._renderService?.dimensions?.css?.cell;
    const measuredRow = container.querySelector<HTMLElement>(".xterm-rows > div");
    const cellWidth =
      typeof dimensions?.width === "number" && dimensions.width > 0
        ? dimensions.width
        : rect.width / terminal.cols;
    const cellHeight =
      typeof dimensions?.height === "number" && dimensions.height > 0
        ? dimensions.height
        : measuredRow
          ? measuredRow.getBoundingClientRect().height
          : rect.height / terminal.rows;
    const cursorX = Math.max(0, Math.min(buffer.cursorX, terminal.cols - 1));
    const cursorY = Math.max(0, Math.min(buffer.cursorY, terminal.rows - 1));

    return {
      x: rect.left + cursorX * cellWidth,
      y: rect.top + (cursorY + 0.5) * cellHeight,
    };
  }, []);

  // Expose terminal methods via ref (React 19 style)
  useImperativeHandle(
    ref,
    () => ({
      focus: () => terminalRef.current?.focus(),
      blur: () => terminalRef.current?.blur(),
      clear: () => terminalRef.current?.clear(),
      write: (data: string) => terminalRef.current?.write(data),
      sendText: (data: string) => sendInput(data),
      sendEnter,
      getCursorClientPoint,
      scrollToBottom: () => {
        const terminal = terminalRef.current;
        if (terminal) {
          jumpXtermToBottom(terminal);
        }
      },
      paste: async () => {
        const terminal = terminalRef.current;
        if (!terminal) return;
        try {
          const text = await navigator.clipboard.readText();
          if (!text) return;
          terminal.input(wrapBracketedPaste(text), false);
        } catch {
          // Clipboard read failed — ignore
        }
      },
      destroy: () => {
        // Send destroy message to kill tmux window before disconnecting
        sendDestroy();
        disconnect();
      },
      getScreenText: (maxLines: number, skipFromBottom = 0) => {
        const terminal = terminalRef.current;
        if (!terminal || maxLines <= 0) {
          return "";
        }
        const buf = terminal.buffer.active;
        const total = buf.length;
        const skip = Math.max(0, skipFromBottom);
        const end = Math.max(0, total - skip);
        const start = Math.max(0, end - maxLines);
        const lines: string[] = [];
        for (let i = start; i < end; i += 1) {
          lines.push(buf.getLine(i)?.translateToString(true) ?? "");
        }
        return lines.join("\n");
      },
      subscribeOutput: (listener: (data: string) => void) => {
        outputListenersRef.current.add(listener);
        return () => {
          outputListenersRef.current.delete(listener);
        };
      },
    }),
    [sendDestroy, disconnect, sendInput, sendEnter, getCursorClientPoint]
  );

  // Update terminal theme when system theme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = currentTheme;
    }
  }, [currentTheme]);

  // Sync readOnly prop to ref
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    normalizedTerminalScaleRef.current = normalizedTerminalScale;
  }, [normalizedTerminalScale]);

  useEffect(() => {
    appliedTerminalScaleRef.current = appliedTerminalScale;
  }, [appliedTerminalScale]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedTerminalScale((current) =>
        current === normalizedTerminalScale ? current : normalizedTerminalScale,
      );
    }, isCanvasScaledTerminal ? CANVAS_TERMINAL_SCALE_FIT_DEBOUNCE_MS : 0);

    return () => {
      clearTimeout(timer);
    };
  }, [isCanvasScaledTerminal, normalizedTerminalScale]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fit = fitAddonRef.current;
    if (!terminal || !fit) {
      return;
    }

    terminal.options.fontSize = scaledTerminalFontSize;
    if (!surfaceActiveRef.current) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (!surfaceActiveRef.current) return;
      if (!isTerminalContainerVisible(containerRef.current)) {
        return;
      }
      fitTerminalPreservingScroll(terminal, fit);
      sendResizeRef.current({ cols: terminal.cols, rows: terminal.rows });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [scaledTerminalFontSize]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    let cancelled = false;
    let linkProvider: { dispose: () => void } | null = null;
    let selectionChangeDisposable: { dispose: () => void } | null = null;
    let titleChangeDisposable: { dispose: () => void } | null = null;
    let osc0HandlerDisposable: { dispose: () => void } | null = null;
    let osc2HandlerDisposable: { dispose: () => void } | null = null;
    let selectionAnchorCleanup: (() => void) | null = null;
    let visibilityPollTimer: ReturnType<typeof setTimeout> | null = null;
    let connectRafId = 0;
    let mouseClassObserver: MutationObserver | null = null;
    let inputQueueAlive = true;
    let inputCoalesceQueue: ReturnType<typeof createTerminalInputCoalesceQueue> | null = null;
    let hostForMouseChrome: HTMLElement | null = null;

    const initTerminal = async () => {
      try {
        await ensureTerminalFontsLoaded();
      } catch (error) {
        console.warn("Failed to preload terminal fonts, using fallback fonts", error);
      }

      if (cancelled || !containerRef.current || terminalRef.current) return;

    // Create terminal instance
    const terminal = new XTerm({
      ...defaultTerminalOptions,
      theme: currentTheme,
      fontSize: scaledTerminalFontSize,
      linkHandler: {
        activate(event, text) {
          void handleResolvedLinkRef.current(event, text);
        },
        allowNonHttpProtocols: true,
      },
    });

    // Create addons
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    // Load addons
    const unicode11Addon = new Unicode11Addon();
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = "11";
    terminal.loadAddon(fitAddon);
    linkProvider = terminal.registerLinkProvider(
      createTerminalLinkProvider(terminal, { cwdPath: cwd, projectRootPath }, (event, target) => {
        void handleTerminalLinkRef.current(event, target);
      })
    );
    terminal.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;
    searchResultsListenerRef.current = searchAddon.onDidChangeResults((event) => {
      setSearchStats({
        current: event.resultIndex >= 0 ? event.resultIndex + 1 : 0,
        total: event.resultCount,
      });
    });
    terminal.loadAddon(new ClipboardAddon(undefined, new SafeClipboardProvider()));

    // Open terminal in container
    terminal.open(containerRef.current);

    // APP-054: while DEC mouse tracking is active, convert trackpad/wheel
    // distance into multiple line reports so TUI viewports move proportionally.
    // When tracking is off, xterm keeps local scrollback behavior.
    hostForMouseChrome = containerRef.current?.parentElement ?? containerRef.current;
    const syncTuiMouseChrome = (active: boolean) => {
      hostForMouseChrome?.classList.toggle("atmos-tui-mouse-active", active);
      // Inline TUI paint runs in the normal buffer; keep the local underline
      // cursor hidden so warm-reveal / redraw never flashes `_` at home.
      if (active) {
        hideLocalXtermCursor(terminal);
      }
    };
    attachTuiMouseWheelMultiplier(terminal, {
      onMouseTrackingActiveChange: syncTuiMouseChrome,
    });
    // xterm toggles `.enable-mouse-events` when DEC mouse modes change; observe
    // class mutations so scrollbar chrome stays in sync after hydrate/restore.
    if (terminal.element && typeof MutationObserver !== "undefined") {
      mouseClassObserver = new MutationObserver(() => {
        syncTuiMouseChrome(isTerminalMouseTrackingActive(terminal));
      });
      mouseClassObserver.observe(terminal.element, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    syncTuiMouseChrome(isTerminalMouseTrackingActive(terminal));

    const readCurrentSelectionSnapshot = (): TerminalSelectionSnapshot | null => {
      const selectedText = terminal.hasSelection() ? terminal.getSelection() : "";
      const normalized = normalizeTerminalSelectionText(selectedText);
      if (!normalized.text.trim()) return null;
      const wrapperRect =
        containerRef.current?.parentElement?.getBoundingClientRect() ??
        containerRef.current?.getBoundingClientRect();
      const fallbackAnchor = wrapperRect
        ? { x: wrapperRect.width / 2, y: Math.max(20, wrapperRect.height * 0.35) }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      return {
        id: `selection-${createOpaqueId()}`,
        text: normalized.text,
        sourceSessionId: sourceSessionIdRef.current,
        sourceTmuxWindowName: sourceTmuxWindowNameRef.current,
        selectedAtMs: Date.now(),
        lineCount: normalized.lineCount,
        byteCount: normalized.byteCount,
        truncated: normalized.truncated,
        anchor: lastSelectionAnchorRef.current ?? fallbackAnchor,
      };
    };

    const emitCurrentSelectionSnapshot = () => {
      if (cancelled) return;
      if (isSearchVisibleRef.current) {
        setCurrentSelectionSnapshot(null);
        return;
      }
      setCurrentSelectionSnapshot(readCurrentSelectionSnapshot());
    };

    const rememberSelectionAnchor = (event: PointerEvent | MouseEvent) => {
      const wrapperRect =
        containerRef.current?.parentElement?.getBoundingClientRect() ??
        containerRef.current?.getBoundingClientRect();
      lastSelectionAnchorRef.current = {
        x: wrapperRect ? event.clientX - wrapperRect.left : event.clientX,
        y: wrapperRect ? event.clientY - wrapperRect.top : event.clientY,
      };
      window.requestAnimationFrame(emitCurrentSelectionSnapshot);
    };

    const selectionContainer = containerRef.current;
    selectionContainer.addEventListener("pointerup", rememberSelectionAnchor);
    selectionContainer.addEventListener("mouseup", rememberSelectionAnchor);
    selectionAnchorCleanup = () => {
      selectionContainer.removeEventListener("pointerup", rememberSelectionAnchor);
      selectionContainer.removeEventListener("mouseup", rememberSelectionAnchor);
    };
    selectionChangeDisposable = terminal.onSelectionChange(() => {
      window.requestAnimationFrame(emitCurrentSelectionSnapshot);
    });

    // ── Paste + Shift+Enter (tmux control mode) ───────────────────────
    // tmux control mode does not forward `\x1b[?2004h` to xterm.js, so xterm
    // never bracket-wraps paste — newlines become raw \r (Enter). Intercept at
    // document capture before xterm.js. Shift+Enter also maps to \r in xterm;
    // Web uses LF, Desktop WKWebView uses CSI-u (see shiftEnterInput).
    {
      const doc = containerRef.current?.ownerDocument ?? document;
      let isHandlingPaste = false;

      const handlePaste = (e: ClipboardEvent) => {
        if (isHandlingPaste || readOnlyRef.current) return;

        const target = e.target as Node;
        if (!containerRef.current?.contains(target)) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        isHandlingPaste = true;

        navigator.clipboard.readText().then((text) => {
          if (!text) return;
          terminal.input(wrapBracketedPaste(text), false);
        }).catch(() => {
          const dt = new DataTransfer();
          const synthetic = new ClipboardEvent("paste", {
            bubbles: true,
            clipboardData: dt,
          });
          (e.target as HTMLElement)?.dispatchEvent(synthetic);
        }).finally(() => {
          isHandlingPaste = false;
        });
      };

      const handleShiftEnter = (e: KeyboardEvent) => {
        if (!e.shiftKey || e.key !== "Enter" || readOnlyRef.current) return;
        const target = e.target as Node;
        if (!containerRef.current?.contains(target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        terminal.input(shiftEnterInput(), false);
      };

      doc.addEventListener("paste", handlePaste, true);
      doc.addEventListener("keydown", handleShiftEnter, true);

      terminalInputCleanupRef.current = () => {
        doc.removeEventListener("paste", handlePaste, true);
        doc.removeEventListener("keydown", handleShiftEnter, true);
      };
    }

    // Native OSC 0/2 titles from agent CLIs (Codex/Claude/…). Capture via both
    // onTitleChange and explicit OSC handlers — under tmux some builds only hit one path.
    // Never feed this into agent detection (APP-047).
    // Do NOT reset lastOscTitleRef here: a warm remount must not drop a title that
    // was already restored from the pane store before this effect re-ran.
    lastTitleRef.current = "";
    if (oscSettleTimerRef.current) {
      clearTimeout(oscSettleTimerRef.current);
      oscSettleTimerRef.current = null;
    }
    // Shell preexec sets OSC to the command name (`ls`) then precmd sets path
    // within ~tens of ms. Settle before painting so short commands never flash.
    const OSC_SETTLE_MS = 180;
    const emitOscTitle = (raw: string | undefined) => {
      pendingOscRawRef.current = raw;
      if (oscSettleTimerRef.current) {
        clearTimeout(oscSettleTimerRef.current);
      }
      oscSettleTimerRef.current = setTimeout(() => {
        oscSettleTimerRef.current = null;
        // nextOscTitleAfterIncoming keeps agent topics on path noise, but
        // clears a stale shell preexec command line (`ps aux | …`).
        const next = nextOscTitleAfterIncoming(
          lastOscTitleRef.current,
          pendingOscRawRef.current,
        );
        if (next === lastOscTitleRef.current) {
          // Warm remount: local ref may be unhydrated while the pane store still
          // holds a topic. Shell preexec must still clear the store suffix.
          if (
            lastOscTitleRef.current === undefined &&
            pendingOscRawRef.current != null &&
            isShellPreexecCommandOscTitle(pendingOscRawRef.current)
          ) {
            onOscTitleChangeRef.current?.(undefined);
          }
          return;
        }
        lastOscTitleRef.current = next;
        onOscTitleChangeRef.current?.(next);
      }, OSC_SETTLE_MS);
    };
    titleChangeDisposable = terminal.onTitleChange((raw) => {
      emitOscTitle(raw);
    });
    // Explicit handlers: return false so xterm default title handling still runs.
    osc0HandlerDisposable = terminal.parser.registerOscHandler(0, (data) => {
      // OSC 0 is "icon name ; window title" or just title
      const title = data.includes(";") ? data.slice(data.indexOf(";") + 1) : data;
      emitOscTitle(title);
      return false;
    });
    osc2HandlerDisposable = terminal.parser.registerOscHandler(2, (data) => {
      emitOscTitle(data);
      return false;
    });

    // Dynamic tab titles:
    //   OSC 9999 — real shell shim (preexec/precmd). CMD_END may clear mouse.
    //   OSC 9998 — server reattach inject only. Title only; never clear mouse
    //              (APP-054: eliminates hydrate vs inject race on refresh).
    //
    // Optimizations on 9999:
    //   1. Dedup — skip update if the new title equals the current one
    //   2. Debounce CMD_START — short-lived commands (ls, pwd, echo) finish
    //      before the timer fires, so CMD_END cancels the pending CMD_START
    //      and the title never flickers.
    const CMD_START_DELAY_MS = 150;

    const applyDynamicTitleCmdStart = (payload: string) => {
      const title = extractCommandName(payload);
      // Enable mouse is safe for both 9998 and 9999 when a TUI is indicated.
      // (Disable is gated separately — only real shell 9999 CMD_END may clear.)
      const onAlternate = terminal.buffer.active.type === "alternate";
      const wantMouse =
        onAlternate ||
        tuiMouseDesiredRef.current ||
        isInlineMouseTuiCommand(payload) ||
        isInlineMouseTuiCommand(title);
      if (wantMouse) {
        tuiMouseDesiredRef.current = true;
        const seq =
          lastMouseRestoreSequenceRef.current || ENABLE_TUI_MOUSE_TRACKING;
        terminal.write(seq);
        syncTuiMouseChrome(true);
      }
      if (cmdStartTimerRef.current) {
        clearTimeout(cmdStartTimerRef.current);
      }
      cmdStartTimerRef.current = setTimeout(() => {
        cmdStartTimerRef.current = null;
        if (title !== lastTitleRef.current) {
          lastTitleRef.current = title;
          onTitleChangeRef.current?.(title);
        }
      }, CMD_START_DELAY_MS);
    };

    const applyDynamicTitleCmdEnd = (
      payload: string,
      opts: { allowMouseSideEffects: boolean },
    ) => {
      if (opts.allowMouseSideEffects) {
        // Real shell idle: clear mouse only when not on alternate screen.
        // Reattach inject must NOT take this path (uses OSC 9998).
        if (shouldDisableTuiMouseOnCmdEnd(terminal.buffer.active.type)) {
          tuiMouseDesiredRef.current = false;
          lastMouseRestoreSequenceRef.current = "";
          terminal.write(DISABLE_TUI_MOUSE_TRACKING);
          syncTuiMouseChrome(false);
        }
      }
      if (cmdStartTimerRef.current) {
        clearTimeout(cmdStartTimerRef.current);
        cmdStartTimerRef.current = null;
      }
      // Do NOT clear OSC on CMD_END. Shell preexec titles are never stored in
      // lastOscTitleRef (nextOscTitleAfterIncoming discards them as they
      // arrive). Empty OSC 0/2 still clears via emitOscTitle.
      const title = shortenPath(payload);
      if (title !== lastTitleRef.current) {
        lastTitleRef.current = title;
        onTitleChangeRef.current?.(title);
      }
    };

    const registerTitleOsc = (osc: number, allowMouseSideEffects: boolean) => {
      terminal.parser.registerOscHandler(osc, (data: string) => {
        const colonIdx = data.indexOf(":");
        if (colonIdx === -1) return true;
        const metaType = data.substring(0, colonIdx);
        const payload = data.substring(colonIdx + 1);
        if (metaType === "CMD_START") {
          applyDynamicTitleCmdStart(payload);
        } else if (metaType === "CMD_END") {
          applyDynamicTitleCmdEnd(payload, { allowMouseSideEffects });
        }
        return true;
      });
    };

    // 9998 = reattach synthetic title (no mouse disable). 9999 = real shell.
    registerTitleOsc(9998, false);
    registerTitleOsc(9999, true);

    // Try to load WebGL addon for better performance and crisp text rendering.
    try {
      const webglAddon = new WebglAddon();
      terminal.loadAddon(webglAddon);
      webglAddonRef.current = webglAddon;

      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        webglAddonRef.current = null;
      });
    } catch (e) {
      console.warn("WebGL addon failed to load, using canvas renderer", e);
    }

    try {
      terminal.loadAddon(new ImageAddon());
    } catch (e) {
      console.warn("Image addon failed to load", e);
    }

    // Store refs BEFORE fit so handlers can access them
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // APP-054: coalesce high-frequency mouse reports / short control bursts so
    // trackpad multi-report scrolls do not enqueue one WS write per line.
    inputQueueAlive = true;
    inputCoalesceQueue = createTerminalInputCoalesceQueue({
      send: (payload) => {
        sendInput(payload);
      },
      isActive: () => inputQueueAlive && !cancelled,
    });

    // Handle terminal input
    terminal.onData((data) => {
      if (!data) return;

      if (readOnlyRef.current) {
        onInputWhileReadOnly?.();
        return;
      }
      if (isTerminalEmulatorReport(data)) {
        sendTerminalReport(data);
      } else {
        inputCoalesceQueue?.enqueue(data);
        interruptInferenceRef.current?.observeInput(data);
      }
      onData?.(data); // Notify parent
    });

    // IMPORTANT: Register onResize BEFORE fitAddon.fit() so the initial
    // resize event (from default 80x24 to actual size) is captured.
    terminal.onResize(({ cols, rows }) => {
      sendResize({ cols, rows });
    });

    let connectStarted = false;
    let initialConnectFrameCount = 0;
    let initialConnectStableFrameCount = 0;
    let lastInitialConnectGrid: { cols: number; rows: number } | null = null;
    const buildRuntimeWsUrl = async () => {
      let runtimeWsUrl = wsUrl;
      try {
        const cfg = await getRuntimeApiConfig();
        const urlObj = new URL(wsUrl);
        if (cfg.port) {
          const runtimeBase = new URL(wsBase(cfg));
          urlObj.host = runtimeBase.host;
          urlObj.protocol = runtimeBase.protocol;
        }
        if (cfg.token) {
          urlObj.searchParams.set("token", cfg.token);
        }
        runtimeWsUrl = urlObj.toString();
      } catch {
        // Fallback to original URL in non-desktop environments.
      }
      return runtimeWsUrl;
    };
    const tryFitAndReadGrid = () => {
      // Off-screen warm panes: never measure (avoids forced layout storms on hop).
      if (!surfaceActiveRef.current) return null;
      if (!isTerminalContainerVisible(containerRef.current)) return null;

      fitAddon.fit();
      const grid = { cols: terminal.cols, rows: terminal.rows };
      return isUsableTerminalGrid(grid.cols, grid.rows) ? grid : null;
    };
    const scheduleConnectCheck = () => {
      if (cancelled || connectStarted || connectRafId) return;
      connectRafId = requestAnimationFrame(runConnectCheck);
    };
    const runConnectCheck = () => {
      connectRafId = 0;
      if (cancelled || connectStarted) return;

      const grid = tryFitAndReadGrid();
      if (!grid) return;

      initialConnectFrameCount += 1;
      if (
        lastInitialConnectGrid &&
        lastInitialConnectGrid.cols === grid.cols &&
        lastInitialConnectGrid.rows === grid.rows
      ) {
        initialConnectStableFrameCount += 1;
      } else {
        lastInitialConnectGrid = grid;
        initialConnectStableFrameCount = 1;
      }

      const waitedLongEnough = initialConnectFrameCount >= INITIAL_CONNECT_MIN_FRAMES;
      const gridIsStable = initialConnectStableFrameCount >= INITIAL_CONNECT_STABLE_FRAMES;
      const hitWaitLimit = initialConnectFrameCount >= INITIAL_CONNECT_MAX_WAIT_FRAMES;
      if ((!waitedLongEnough || !gridIsStable) && !hitWaitLimit) {
        scheduleConnectCheck();
        return;
      }

      connectStarted = true;
      // Connect with runtime token in desktop mode, then include initial cols/rows.
      // cancelled is set to true by the cleanup function below. In desktop (Tauri) mode,
      // getRuntimeApiConfig() needs ~50ms for IPC. React Strict Mode double-mounts the
      // component, so two async IIFEs may be in flight simultaneously. The cancelled flag
      // ensures only the IIFE belonging to the live mount actually calls connect().
      void (async () => {
        const runtimeWsUrl = await buildRuntimeWsUrl();
        if (cancelled) return;
        const separator = runtimeWsUrl.includes("?") ? "&" : "?";
        const connectUrl = `${runtimeWsUrl}${separator}cols=${terminal.cols}&rows=${terminal.rows}`;
        connect(connectUrl);
      })();
    };
    const connectWhenVisible = () => {
      if (cancelled || connectStarted) return;
      scheduleConnectCheck();
    };
    const scheduleVisibilityPoll = () => {
      if (cancelled || connectStarted || visibilityPollTimer) return;
      visibilityPollTimer = setTimeout(() => {
        visibilityPollTimer = null;
        connectWhenVisible();
        scheduleVisibilityPoll();
      }, 250);
    };

    // Only connect once the pane is visible and FitAddon can produce a real grid.
    // Hidden terminal tabs often measure as 10x5; hydrating a 148-column tmux
    // snapshot into that tiny xterm buffer permanently wraps and corrupts TUIs.
    connectWhenVisible();
    scheduleVisibilityPoll();

    // ── Cmd/Ctrl+C: copy selection to clipboard ──────────────────────
    terminal.attachCustomKeyEventHandler((event) => {
      if (isFindShortcut(event)) {
        openSearch();
        return false;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (terminal.hasSelection()) {
          const selection = terminal.getSelection();
          if (selection?.trim() && navigator.clipboard) {
            void navigator.clipboard.writeText(selection);
          }
          return false; // Consumed — don't send Ctrl+C to terminal
        }
      }
      return true;
    });

    // ── Scroll-to-bottom button tracking ────────────────────────────
    // xterm.js handles all scrolling natively (local scrollback: 10000).
    // Show button when user scrolls away from bottom.
    terminal.onScroll(() => {
      const buf = terminal.buffer.active;
      const atBottom = buf.viewportY >= buf.baseY;
      setShowScrollDown(!atBottom);
    });

    // ── Resize observer ────────────────────────────────────────────
    // Uses rAF to coalesce multiple ResizeObserver fires within one frame.
    // Control mode sends raw pane output, so xterm.js owns scrollback and TUI
    // alternate-screen transitions without backend cleanup hacks.
    const runResizeFit = () => {
      resizeRafIdRef.current = 0;
      const term = terminalRef.current;
      const fit = fitAddonRef.current;
      if (!term || !fit) return;
      // Host said off-screen — do not read layout (forced-layout thrash source).
      if (!surfaceActiveRef.current) return;
      // Skip when terminal container is hidden (e.g. tab not visible)
      if (!isTerminalContainerVisible(containerRef.current)) return;

      fitTerminalPreservingScroll(term, fit);
      connectWhenVisible();
    };
    const scheduleResizeFit = () => {
      if (!surfaceActiveRef.current) return;
      if (resizeRafIdRef.current) return;
      resizeRafIdRef.current = requestAnimationFrame(runResizeFit);
    };
    const resizeObserver = new ResizeObserver(() => {
      if (!surfaceActiveRef.current) return;
      if (!isCanvasScaledTerminal) {
        scheduleResizeFit();
        return;
      }

      if (resizeDebounceTimerRef.current) {
        clearTimeout(resizeDebounceTimerRef.current);
      }
      const scaleFitPending =
        Math.abs(normalizedTerminalScaleRef.current - appliedTerminalScaleRef.current) > 0.001;
      if (!scaleFitPending) {
        scheduleResizeFit();
        return;
      }

      resizeDebounceTimerRef.current = setTimeout(() => {
        resizeDebounceTimerRef.current = null;
        scheduleResizeFit();
      }, CANVAS_TERMINAL_SCALE_FIT_DEBOUNCE_MS);
    });

    resizeObserverRef.current = resizeObserver;
    // Only observe while this surface is the active frame/tab (IMP-014).
    if (surfaceActiveRef.current) {
      resizeObserver.observe(containerRef.current);
      terminal.focus();
    }
    }; // end initTerminal

    initTerminal();

    return () => {
      cancelled = true;
      inputQueueAlive = false;
      inputCoalesceQueue?.clear();
      inputCoalesceQueue = null;
      mouseClassObserver?.disconnect();
      mouseClassObserver = null;
      hostForMouseChrome?.classList.remove("atmos-tui-mouse-active");
      hostForMouseChrome = null;
      terminalInputCleanupRef.current?.();
      terminalInputCleanupRef.current = null;
      if (visibilityPollTimer) clearTimeout(visibilityPollTimer);
      if (connectRafId) cancelAnimationFrame(connectRafId);
      selectionAnchorCleanup?.();
      selectionChangeDisposable?.dispose();
      titleChangeDisposable?.dispose();
      osc0HandlerDisposable?.dispose();
      osc2HandlerDisposable?.dispose();
      setCurrentSelectionSnapshot(null);
      if (resizeRafIdRef.current) {
        cancelAnimationFrame(resizeRafIdRef.current);
        resizeRafIdRef.current = 0;
      }
      if (resizeDebounceTimerRef.current) {
        clearTimeout(resizeDebounceTimerRef.current);
        resizeDebounceTimerRef.current = null;
      }
      disconnect();
      resizeObserverRef.current?.disconnect();
      if (cmdStartTimerRef.current) clearTimeout(cmdStartTimerRef.current);
      if (oscSettleTimerRef.current) {
        clearTimeout(oscSettleTimerRef.current);
        oscSettleTimerRef.current = null;
      }
      searchResultsListenerRef.current?.dispose();
      searchResultsListenerRef.current = null;
      linkProvider?.dispose();
      searchAddonRef.current = null;
      webglAddonRef.current?.dispose();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, workspaceId, cwd, projectRootPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warm/inactive: disconnect RO so sibling hops do not thrash. Reveal: re-observe + one fit.
  // Only pin tmux when the grid actually changes — unnecessary SIGWINCH makes
  // inline Grok-class TUIs clear+repaint (flash of xterm `_` cursor at home).
  useEffect(() => {
    const ro = resizeObserverRef.current;
    const el = containerRef.current;
    if (!ro || !el || !terminalRef.current) return;

    if (!surfaceActive) {
      ro.disconnect();
      if (resizeRafIdRef.current) {
        cancelAnimationFrame(resizeRafIdRef.current);
        resizeRafIdRef.current = 0;
      }
      if (resizeDebounceTimerRef.current) {
        clearTimeout(resizeDebounceTimerRef.current);
        resizeDebounceTimerRef.current = null;
      }
      return;
    }

    ro.observe(el);
    let cancelled = false;
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || !surfaceActiveRef.current) return;
        const term = terminalRef.current;
        const fit = fitAddonRef.current;
        if (!term || !fit) return;
        if (!isTerminalContainerVisible(containerRef.current)) return;
        // Inline mouse TUI: hide local cursor before any possible repaint flash.
        if (
          tuiMouseDesiredRef.current ||
          isTerminalMouseTrackingActive(term)
        ) {
          hideLocalXtermCursor(term);
        }
        const { cols, rows, changed } = fitTerminalPreservingScroll(term, fit);
        if (changed) {
          sendResizeRef.current({ cols, rows });
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
    };
  }, [surfaceActive]);

  return (
    <TerminalChrome
      className={className}
      closeSearch={closeSearch}
      containerRef={containerRef}
      currentTheme={currentTheme}
      handleSearchQueryChange={handleSearchQueryChange}
      isConnected={isConnected}
      isDark={isDark}
      isSearchVisible={isSearchVisible}
      onOpenSearch={openSearch}
      onPointerModifierStateChange={updatePointerModifierState}
      onScrollToBottom={() => {
        const terminal = terminalRef.current;
        if (terminal) {
          jumpXtermToBottom(terminal);
        }
        setShowScrollDown(false);
      }}
      runSearch={runSearch}
      searchHasMatch={searchHasMatch}
      searchInputRef={searchInputRef}
      searchQuery={searchQuery}
      searchStats={searchStats}
      sessionId={sessionId}
      showScrollDown={showScrollDown}
      terminalSearchInputId={terminalSearchInputId}
      terminalScale={normalizedTerminalScale}
      uiStatus={uiStatus}
      workspaceId={workspaceId}
      errorMessage={attachError}
      onCreateNew={status === "error" ? handleCreateNew : undefined}
      onRetry={status === "error" ? handleRetryAttach : undefined}
      selectionToolbar={
        onAddSelectionAsContext ? (
          <TerminalSelectionToolbar
            snapshot={selectionSnapshot}
            onAddAsContext={(snapshot) => {
              onAddSelectionAsContext(snapshot);
              setCurrentSelectionSnapshot(null);
            }}
            onDismiss={() => {
              setCurrentSelectionSnapshot(null);
              terminalRef.current?.clearSelection();
            }}
            onSideChatForSelection={onStartSideChatForSelection ? (snapshot) => {
              onStartSideChatForSelection(snapshot);
              setCurrentSelectionSnapshot(null);
            } : undefined}
          />
        ) : null
      }
    />
  );
};



Terminal.displayName = "Terminal";


export { Terminal };
export type { TerminalProps };
