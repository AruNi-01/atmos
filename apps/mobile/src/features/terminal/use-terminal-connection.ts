import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createTerminalOutputBatcher } from "@/features/terminal/terminal-output-batcher";
import { TerminalWsClient, type TerminalWsState } from "@/api/terminal-ws-client";
import type { MobileWsState } from "@/api/mobile-ws-client";
import type { TerminalWebViewHandle } from "@/features/terminal/TerminalWebView";
import type { MobileTerminalEntry } from "@/stores/terminal-store";

export type TerminalConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

const MIN_TERMINAL_COLS = 20;
const MIN_TERMINAL_ROWS = 8;
const RESIZE_INTERVAL_MS = 80;
const OPEN_AFTER_MEASURE_MS = 150;

type UseTerminalConnectionOptions = {
  activeEntry: MobileTerminalEntry | null;
  activeSessionId: string | null;
  appWsState: MobileWsState;
  projectName?: string | null;
  terminalWsUrl?: string;
  updateEntry: (workspaceId: string, entryId: string, patch: Partial<MobileTerminalEntry>) => void;
  webViewRef: RefObject<TerminalWebViewHandle | null>;
  workspaceId: string;
  workspaceName: string;
};

type UseTerminalConnectionResult = {
  attached: boolean;
  connectionState: TerminalConnectionState;
  sendTerminalInput: (data: string) => void;
  sendTerminalResize: (cols: number, rows: number) => void;
  setTerminalError: Dispatch<SetStateAction<string | null>>;
  terminalError: string | null;
};

export function useTerminalConnection({
  activeEntry,
  activeSessionId,
  appWsState,
  projectName,
  terminalWsUrl,
  updateEntry,
  webViewRef,
  workspaceId,
  workspaceName,
}: UseTerminalConnectionOptions): UseTerminalConnectionResult {
  const terminalClientRef = useRef<TerminalWsClient | null>(null);
  const terminalSizeRef = useRef({ cols: 80, rows: 24 });
  const hasMeasuredRef = useRef(false);
  const sessionOpenedRef = useRef(false);
  const openSessionRef = useRef<(() => void) | null>(null);
  const lastSentSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const lastResizeSentAtRef = useRef(0);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const [connectionState, setConnectionState] = useState<TerminalConnectionState>("disconnected");
  const [attached, setAttached] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  const sendTerminalInput = useCallback(
    (data: string) => {
      const client = terminalClientRef.current;
      if (!activeSessionId) {
        setTerminalError("Choose a terminal before sending input.");
        return;
      }
      if (!client?.isOpen()) {
        setTerminalError("Terminal is disconnected. Reconnect before sending input.");
        return;
      }
      try {
        client.send({
          type: "terminal_input",
          session_id: activeSessionId,
          data,
        });
        setTerminalError(null);
      } catch (error) {
        setTerminalError(error instanceof Error ? error.message : "Terminal input failed.");
      }
    },
    [activeSessionId],
  );

  const deliverResize = useCallback((cols: number, rows: number) => {
    const sessionId = activeSessionIdRef.current;
    const client = terminalClientRef.current;
    if (!sessionId || !client?.isOpen() || !sessionOpenedRef.current) return;
    const last = lastSentSizeRef.current;
    if (last && last.cols === cols && last.rows === rows) return;
    try {
      client.send({
        type: "terminal_resize",
        session_id: sessionId,
        cols,
        rows,
      });
      lastSentSizeRef.current = { cols, rows };
      lastResizeSentAtRef.current = Date.now();
    } catch {
      // The next fit retries. terminal_open already carried the latest measured size.
    }
  }, []);

  const sendTerminalResize = useCallback(
    (cols: number, rows: number) => {
      if (cols < MIN_TERMINAL_COLS || rows < MIN_TERMINAL_ROWS) return;
      hasMeasuredRef.current = true;
      terminalSizeRef.current = { cols, rows };
      const client = terminalClientRef.current;
      if (client?.isOpen() && !sessionOpenedRef.current) {
        openSessionRef.current?.();
        return;
      }

      const elapsed = Date.now() - lastResizeSentAtRef.current;
      if (elapsed >= RESIZE_INTERVAL_MS) {
        pendingResizeRef.current = null;
        if (resizeTimerRef.current) {
          clearTimeout(resizeTimerRef.current);
          resizeTimerRef.current = null;
        }
        deliverResize(cols, rows);
        return;
      }

      pendingResizeRef.current = { cols, rows };
      if (resizeTimerRef.current) return;
      resizeTimerRef.current = setTimeout(() => {
        resizeTimerRef.current = null;
        const pending = pendingResizeRef.current;
        pendingResizeRef.current = null;
        if (!pending) return;
        deliverResize(pending.cols, pending.rows);
      }, RESIZE_INTERVAL_MS - elapsed);
    },
    [deliverResize],
  );

  const activeEntryId = activeEntry?.id;
  const activeEntryIsNewRef = useRef(activeEntry?.isNew);
  const activeEntryLabelRef = useRef(activeEntry?.label);
  const activeEntryTmuxWindowIndexRef = useRef(activeEntry?.tmuxWindowIndex);
  const activeEntryTmuxWindowNameRef = useRef(activeEntry?.tmuxWindowName);
  const projectNameRef = useRef(projectName);
  const workspaceNameRef = useRef(workspaceName);
  activeEntryIsNewRef.current = activeEntry?.isNew;
  activeEntryLabelRef.current = activeEntry?.label;
  activeEntryTmuxWindowIndexRef.current = activeEntry?.tmuxWindowIndex;
  activeEntryTmuxWindowNameRef.current = activeEntry?.tmuxWindowName;
  projectNameRef.current = projectName;
  workspaceNameRef.current = workspaceName;

  useEffect(() => {
    if (appWsState !== "open") {
      setConnectionState(
        appWsState === "connecting" ? "connecting" : appWsState === "reconnecting" ? "reconnecting" : "disconnected",
      );
      setTerminalError(
        appWsState === "connecting"
          ? null
          : appWsState === "reconnecting"
            ? "Connection to Atmos Computer is reconnecting."
            : "Connection to Atmos Computer is unavailable.",
      );
      terminalClientRef.current?.close();
      terminalClientRef.current = null;
      setAttached(false);
      return undefined;
    }

    if (!activeEntryId || !activeSessionId || !activeEntryLabelRef.current) {
      setConnectionState("disconnected");
      setTerminalError(null);
      terminalClientRef.current?.close();
      terminalClientRef.current = null;
      setAttached(false);
      return undefined;
    }

    if (!terminalWsUrl) {
      setConnectionState("disconnected");
      setAttached(false);
      setTerminalError("Select an online Computer to open a terminal.");
      return undefined;
    }

    const client = new TerminalWsClient(terminalWsUrl);
    const outputBatcher = createTerminalOutputBatcher({
      flush: (chunks) => webViewRef.current?.writeBase64(chunks),
    });
    terminalClientRef.current = client;
    sessionOpenedRef.current = false;
    lastSentSizeRef.current = null;
    setAttached(false);
    setConnectionState("connecting");
    setTerminalError(null);

    let openTimer: ReturnType<typeof setTimeout> | null = null;
    const openActiveTerminal = () => {
      if (sessionOpenedRef.current) return;
      sessionOpenedRef.current = true;
      if (openTimer) {
        clearTimeout(openTimer);
        openTimer = null;
      }
      const { cols, rows } = terminalSizeRef.current;
      const metaIsNew = activeEntryIsNewRef.current;
      const metaLabel = activeEntryLabelRef.current ?? "Terminal";
      const metaWindowIndex = activeEntryTmuxWindowIndexRef.current;
      const metaWindowName = activeEntryTmuxWindowNameRef.current;
      client.send({
        type: "terminal_open",
        session_id: activeSessionId,
        workspace_id: workspaceId,
        attach: Boolean((metaWindowIndex != null || metaWindowName) && !metaIsNew),
        tmux_window_name: metaWindowName,
        tmux_window_index: metaWindowIndex,
        project_name: projectNameRef.current ?? undefined,
        workspace_name: workspaceNameRef.current,
        terminal_name: metaLabel,
        cols,
        rows,
      });
      lastSentSizeRef.current = { cols, rows };
    };
    openSessionRef.current = openActiveTerminal;

    const unsubscribeOpen = client.onOpen(() => {
      if (hasMeasuredRef.current) {
        openActiveTerminal();
        return;
      }
      openTimer = setTimeout(openActiveTerminal, OPEN_AFTER_MEASURE_MS);
    });
    const unsubscribeClose = client.onClose(() => {
      sessionOpenedRef.current = false;
      lastSentSizeRef.current = null;
      setAttached(false);
      setConnectionState("disconnected");
    });
    const unsubscribeError = client.onError((error) => {
      setConnectionState("disconnected");
      setTerminalError(error);
    });
    const unsubscribeState = client.onState((state) => {
      setConnectionState(terminalConnectionStateFromWs(state));
      if (state === "reconnecting") {
        setTerminalError("Terminal connection dropped. Reconnecting...");
      }
    });
    const unsubscribeMessages = client.subscribe((message) => {
      if (message.type === "terminal_output" && message.session_id === activeSessionId) {
        outputBatcher.enqueue(message.data_b64);
        return;
      }

      if (
        (message.type === "terminal_created" || message.type === "terminal_attached") &&
        message.session_id === activeSessionId
      ) {
        setConnectionState("connected");
        setAttached(true);
        setTerminalError(null);
        if (message.type === "terminal_created" && activeEntryIsNewRef.current) {
          updateEntry(workspaceId, activeEntryId, {
            isNew: false,
            tmuxWindowName: activeEntryTmuxWindowNameRef.current ?? activeEntryLabelRef.current,
          });
        }
        if (message.snapshot) {
          webViewRef.current?.restoreSnapshot(message.snapshot);
        }
        return;
      }

      if (message.type === "terminal_error") {
        if (!message.session_id || message.session_id === activeSessionId) {
          setTerminalError(message.error);
        }
        return;
      }

      if (
        (message.type === "terminal_closed" || message.type === "terminal_destroyed") &&
        message.session_id === activeSessionId
      ) {
        setAttached(false);
        setConnectionState("disconnected");
      }
    });

    client.connect();
    return () => {
      if (openTimer) clearTimeout(openTimer);
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      pendingResizeRef.current = null;
      openSessionRef.current = null;
      unsubscribeOpen();
      unsubscribeClose();
      unsubscribeError();
      unsubscribeState();
      unsubscribeMessages();
      outputBatcher.clear();
      client.close();
      terminalClientRef.current = null;
    };
  }, [
    activeEntryId,
    activeSessionId,
    appWsState,
    terminalWsUrl,
    updateEntry,
    webViewRef,
    workspaceId,
  ]);

  return {
    attached,
    connectionState,
    sendTerminalInput,
    sendTerminalResize,
    setTerminalError,
    terminalError,
  };
}

function terminalConnectionStateFromWs(state: TerminalWsState): TerminalConnectionState {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  if (state === "reconnecting") return "reconnecting";
  return "disconnected";
}
