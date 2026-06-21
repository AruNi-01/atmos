import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createTerminalOutputBatcher } from "@/features/terminal/terminal-output-batcher";
import { TerminalWsClient, type TerminalWsState } from "@/api/terminal-ws-client";
import type { MobileWsState } from "@/api/mobile-ws-client";
import type { TerminalWebViewHandle } from "@/features/terminal/TerminalWebView";
import type { MobileTerminalEntry } from "@/stores/terminal-store";

export type TerminalConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

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
  const [connectionState, setConnectionState] = useState<TerminalConnectionState>("disconnected");
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

  const sendTerminalResize = useCallback(
    (cols: number, rows: number) => {
      terminalSizeRef.current = { cols, rows };
      if (!activeSessionId) return;
      const client = terminalClientRef.current;
      if (!client?.isOpen()) return;
      try {
        client.send({
          type: "terminal_resize",
          session_id: activeSessionId,
          cols,
          rows,
        });
      } catch {
        // Resize is opportunistic; the next terminal open will send a fresh size.
      }
    },
    [activeSessionId],
  );

  const activeEntryId = activeEntry?.id;
  const activeEntryIsNew = activeEntry?.isNew;
  const activeEntryLabel = activeEntry?.label;
  const activeEntrySessionId = activeEntry?.sessionId;
  const activeEntryTmuxWindowIndex = activeEntry?.tmuxWindowIndex;
  const activeEntryTmuxWindowName = activeEntry?.tmuxWindowName;

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
      return undefined;
    }

    if (!activeEntryId || !activeSessionId || !activeEntryLabel) {
      setConnectionState("disconnected");
      setTerminalError(null);
      terminalClientRef.current?.close();
      terminalClientRef.current = null;
      return undefined;
    }

    if (!terminalWsUrl) {
      setConnectionState("disconnected");
      setTerminalError("Select an online Computer to open a terminal.");
      return undefined;
    }

    const client = new TerminalWsClient(terminalWsUrl);
    const outputBatcher = createTerminalOutputBatcher({
      flush: (chunks) => webViewRef.current?.writeBase64(chunks),
    });
    terminalClientRef.current = client;
    setConnectionState("connecting");
    setTerminalError(null);

    const openActiveTerminal = () => {
      const { cols, rows } = terminalSizeRef.current;
      client.send({
        type: "terminal_open",
        session_id: activeSessionId,
        workspace_id: workspaceId,
        attach: Boolean((activeEntryTmuxWindowIndex != null || activeEntryTmuxWindowName) && !activeEntryIsNew),
        tmux_window_name: activeEntryTmuxWindowName,
        tmux_window_index: activeEntryTmuxWindowIndex,
        project_name: projectName ?? undefined,
        workspace_name: workspaceName,
        terminal_name: activeEntryLabel,
        cols,
        rows,
      });
    };

    const unsubscribeOpen = client.onOpen(openActiveTerminal);
    const unsubscribeClose = client.onClose(() => {
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
        setTerminalError(null);
        if (message.type === "terminal_created" && activeEntryIsNew) {
          updateEntry(workspaceId, activeEntryId, {
            isNew: false,
            tmuxWindowName: activeEntryTmuxWindowName ?? activeEntryLabel,
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
        setConnectionState("disconnected");
      }
    });

    client.connect();
    return () => {
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
    activeEntryIsNew,
    activeEntryLabel,
    activeEntrySessionId,
    activeEntryTmuxWindowIndex,
    activeEntryTmuxWindowName,
    activeSessionId,
    appWsState,
    projectName,
    terminalWsUrl,
    updateEntry,
    webViewRef,
    workspaceId,
    workspaceName,
  ]);

  return {
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
