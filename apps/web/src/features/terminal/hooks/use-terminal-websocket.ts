"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ByteStreamPort, StreamHandle } from "@atmos/shared/terminal";
import type {
  WsTerminalRequest,
  TerminalSize,
  TerminalSnapshot,
} from "../types/index";
import { createBoundTerminalByteStreamPort } from "../lib/bind-terminal-byte-stream-port";
import { dispatchTerminalServerPayload } from "../lib/dispatch-terminal-server-message";
import { debugLog } from "@/shared/lib/desktop-logger";

interface UseTerminalWebSocketOptions {
  url: string;
  sessionId: string;
  onOutput: (data: string | Uint8Array) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  onAttached?: (snapshot?: TerminalSnapshot | null) => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  workspaceId?: string;
  /** Test seam: inject a port instead of runtime binding (ws vs ipc). */
  createPort?: (url: string) => ByteStreamPort;
}

interface UseTerminalWebSocketReturn {
  isConnected: boolean;
  isReconnecting: boolean;
  sendInput: (data: string) => void;
  sendEnter: () => void;
  sendTerminalReport: (data: string) => void;
  sendResize: (size: TerminalSize) => void;
  sendCreate: (workspaceId: string) => void;
  sendAttach: (workspaceId: string, tmuxWindowName: string) => void;
  sendDestroy: () => void;
  /** Connect. Pass urlOverride to use a different URL (e.g. with cols/rows). */
  connect: (urlOverride?: string) => void;
  disconnect: () => void;
}

export function useTerminalWebSocket({
  url,
  sessionId,
  onOutput,
  onConnected,
  onDisconnected,
  onError,
  onAttached,
  reconnectAttempts = 3,
  reconnectDelay = 1000,
  workspaceId,
  createPort,
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const handleRef = useRef<StreamHandle | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openingRef = useRef(false);
  const generationRef = useRef(0);
  /** Once disconnect() is called, this ref prevents any further reconnection
   *  attempts even from stale onclose handlers of previous stream handles. */
  const disconnectedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const dropHandle = useCallback(() => {
    const handle = handleRef.current;
    handleRef.current = null;
    openingRef.current = false;
    handle?.close();
  }, []);

  const sendMessage = useCallback((message: WsTerminalRequest) => {
    const handle = handleRef.current;
    if (handle?.readyState() === "open") {
      handle.send(JSON.stringify(message));
    }
  }, [sessionId]);

  const sendInput = useCallback(
    (data: string) => {
      sendMessage({
        type: "terminal_input",
        session_id: sessionId,
        data,
      });
    },
    [sessionId, sendMessage]
  );

  const sendEnter = useCallback(
    () => {
      sendMessage({
        type: "terminal_enter",
        session_id: sessionId,
      });
    },
    [sessionId, sendMessage]
  );

  const sendTerminalReport = useCallback(
    (data: string) => {
      sendMessage({
        type: "terminal_report",
        session_id: sessionId,
        data,
      });
    },
    [sessionId, sendMessage]
  );

  const sendResize = useCallback(
    (size: TerminalSize) => {
      sendMessage({
        type: "terminal_resize",
        session_id: sessionId,
        cols: size.cols,
        rows: size.rows,
      });
    },
    [sessionId, sendMessage]
  );

  const sendCreate = useCallback(
    (workspaceId: string) => {
      sendMessage({
        type: "terminal_create",
        workspace_id: workspaceId,
      });
    },
    [sendMessage]
  );

  const sendAttach = useCallback(
    (workspaceId: string, tmuxWindowName: string) => {
      sendMessage({
        type: "terminal_attach",
        workspace_id: workspaceId,
        tmux_window_name: tmuxWindowName,
      });
    },
    [sendMessage]
  );

  const sendDestroy = useCallback(() => {
    sendMessage({
      type: "terminal_destroy",
      session_id: sessionId,
    });
  }, [sessionId, sendMessage]);

  const disconnect = useCallback(() => {
    disconnectedRef.current = true;
    generationRef.current += 1;
    clearReconnectTimeout();
    reconnectCountRef.current = reconnectAttempts;
    dropHandle();
    setIsConnected(false);
    setIsReconnecting(false);
  }, [clearReconnectTimeout, dropHandle, reconnectAttempts, sessionId]);

  const effectiveUrlRef = useRef(url);

  const connect = useCallback((urlOverride?: string) => {
    const liveHandle = handleRef.current;
    if (
      openingRef.current ||
      (liveHandle && liveHandle.readyState() !== "closed")
    ) {
      return;
    }

    const connectUrl = urlOverride || effectiveUrlRef.current;
    if (urlOverride) {
      effectiveUrlRef.current = urlOverride;
    }

    disconnectedRef.current = false;
    reconnectCountRef.current = 0;
    openingRef.current = true;
    const generation = ++generationRef.current;
    const port = (createPort ?? createBoundTerminalByteStreamPort)(connectUrl);

    void (async () => {
      try {
        const handle = await port.open({
          url: connectUrl,
          sessionId,
        });
        if (generation !== generationRef.current || disconnectedRef.current) {
          handle.close();
          return;
        }
        handleRef.current = handle;
        openingRef.current = false;
        debugLog(
          `terminal-stream open session=${sessionId} carrier=${handle.carrier}`,
        );
        handle.subscribe({
          onOpen: () => {
            if (generation !== generationRef.current) return;
            setIsConnected(true);
            setIsReconnecting(false);
            reconnectCountRef.current = 0;
            onConnected?.();
          },
          onMessage: (data) => {
            if (generation !== generationRef.current) return;
            const dispatch = dispatchTerminalServerPayload(data, sessionId);
            switch (dispatch.action) {
              case "output":
                onOutput(dispatch.data);
                break;
              case "attached":
                onAttached?.(dispatch.snapshot);
                break;
              case "closed":
                disconnect();
                break;
              case "destroyed":
                reconnectCountRef.current = reconnectAttempts;
                disconnect();
                break;
              case "error":
                reconnectCountRef.current = reconnectAttempts;
                clearReconnectTimeout();
                onError?.(dispatch.error);
                break;
              case "ignore":
                break;
            }
          },
          onClose: () => {
            const superseded =
              handleRef.current != null && handleRef.current !== handle;
            if (handleRef.current === handle) {
              handleRef.current = null;
            }
            openingRef.current = false;
            if (superseded) return;

            setIsConnected(false);
            onDisconnected?.();

            if (disconnectedRef.current) {
              setIsReconnecting(false);
              return;
            }

            if (reconnectCountRef.current < reconnectAttempts) {
              reconnectCountRef.current++;
              setIsReconnecting(true);
              reconnectTimeoutRef.current = setTimeout(() => {
                connectRef.current?.();
              }, reconnectDelay * reconnectCountRef.current);
            } else {
              setIsReconnecting(false);
            }
          },
          onError: () => {
            if (
              disconnectedRef.current ||
              generation !== generationRef.current
            ) {
              return;
            }
            onError?.("Terminal connection error");
          },
        });
      } catch (err) {
        if (generation !== generationRef.current) return;
        openingRef.current = false;
        onError?.(`Failed to connect: ${err}`);
      }
    })();
  }, [
    url,
    sessionId,
    onOutput,
    onConnected,
    onDisconnected,
    onError,
    onAttached,
    workspaceId,
    reconnectAttempts,
    reconnectDelay,
    clearReconnectTimeout,
    disconnect,
    createPort,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    return () => {
      disconnectedRef.current = true;
      generationRef.current += 1;
      clearReconnectTimeout();
      dropHandle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearReconnectTimeout, dropHandle]);

  return {
    isConnected,
    isReconnecting,
    sendInput,
    sendEnter,
    sendTerminalReport,
    sendResize,
    sendCreate,
    sendAttach,
    sendDestroy,
    connect,
    disconnect,
  };
}
