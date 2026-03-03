"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WsTerminalRequest,
  WsTerminalResponse,
  TerminalSize,
} from "./types";

interface UseTerminalWebSocketOptions {
  url: string;
  sessionId: string;
  onOutput: (data: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  onAttached?: (history?: string) => void;
  onCopyModeStatus?: (inCopyMode: boolean) => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  workspaceId?: string;
}

interface UseTerminalWebSocketReturn {
  isConnected: boolean;
  isReconnecting: boolean;
  sendInput: (data: string) => void;
  sendResize: (size: TerminalSize) => void;
  sendCreate: (workspaceId: string) => void;
  sendAttach: (workspaceId: string, tmuxWindowName: string) => void;
  sendDestroy: () => void;
  /** Safely exit tmux copy-mode via backend `send-keys -X cancel` */
  sendCancelCopyMode: () => void;
  /** Check if tmux pane is currently in copy-mode */
  sendCheckCopyMode: () => void;
  /** Connect to WebSocket. Pass urlOverride to use a different URL (e.g. with cols/rows). */
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
  onCopyModeStatus,
  reconnectAttempts = 3,
  reconnectDelay = 1000,
  workspaceId,
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  /** Once disconnect() is called, this ref prevents any further reconnection
   *  attempts even from stale onclose handlers of previous WebSocket instances. */
  const disconnectedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: WsTerminalRequest) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

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

  const sendCancelCopyMode = useCallback(() => {
    sendMessage({
      type: "tmux_cancel_copy_mode",
      session_id: sessionId,
    });
  }, [sessionId, sendMessage]);

  const sendCheckCopyMode = useCallback(() => {
    sendMessage({
      type: "tmux_check_copy_mode",
      session_id: sessionId,
    });
  }, [sessionId, sendMessage]);

  const disconnect = useCallback(() => {
    // Mark as permanently disconnected - prevents all future reconnection
    // attempts, even from stale onclose handlers of previous WebSocket instances
    disconnectedRef.current = true;
    clearReconnectTimeout();
    reconnectCountRef.current = reconnectAttempts; // Prevent reconnection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsReconnecting(false);
  }, [clearReconnectTimeout, reconnectAttempts]);

  // Store the effective URL for reconnections (may include cols/rows from initial connect)
  const effectiveUrlRef = useRef(url);

  const connect = useCallback((urlOverride?: string) => {
    // Guard against both OPEN and CONNECTING states to prevent duplicate connections.
    // In desktop (Tauri) mode, getRuntimeApiConfig() is async (~50ms IPC round-trip).
    // React Strict Mode double-mounts the component, launching two async IIFEs. Both
    // complete after the cleanup runs (which only nulls wsRef when no socket exists yet),
    // so both call connect() — the second one sees the first socket still CONNECTING and
    // would create a second connection, causing every PTY character to arrive twice.
    if (wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
         wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // If a URL override is provided (e.g. with cols/rows), store it for reconnections
    const connectUrl = urlOverride || effectiveUrlRef.current;
    if (urlOverride) {
      effectiveUrlRef.current = urlOverride;
    }

    try {
      // Reset disconnected flag since connect() is always an intentional call.
      // The flag only prevents stale onclose handlers from triggering reconnection.
      disconnectedRef.current = false;
      reconnectCountRef.current = 0;
      const ws = new WebSocket(connectUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsReconnecting(false);
        reconnectCountRef.current = 0;
        onConnected?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: WsTerminalResponse = JSON.parse(event.data);

          switch (message.type) {
            case "terminal_output":
              if (message.session_id === sessionId) {
                onOutput(message.data);
              }
              break;
            case "terminal_created":
              // Session created successfully
              break;
            case "terminal_attached":
              // Session attached (reconnected)
              if (message.session_id === sessionId) {
                onAttached?.(message.history);
              }
              break;
            case "terminal_closed":
              if (message.session_id === sessionId) {
                // Session closed (detached) - could reconnect
                disconnect();
              }
              break;
            case "terminal_destroyed":
              if (message.session_id === sessionId) {
                // Session destroyed - no reconnect possible
                reconnectCountRef.current = reconnectAttempts; // Prevent reconnect
                disconnect();
              }
              break;
            case "terminal_error":
              onError?.(message.error);
              break;
            case "tmux_copy_mode_status":
              if (message.session_id === sessionId) {
                onCopyModeStatus?.(message.in_copy_mode);
              }
              break;
          }
        } catch {
          // Handle non-JSON messages (raw terminal output)
          onOutput(event.data);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        onDisconnected?.();

        // Do NOT reconnect if disconnect() was called (permanent teardown)
        if (disconnectedRef.current) {
          setIsReconnecting(false);
          return;
        }

        // Attempt to reconnect
        if (reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++;
          setIsReconnecting(true);
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current?.();
          }, reconnectDelay * reconnectCountRef.current);
        } else {
          setIsReconnecting(false);
        }
      };

      ws.onerror = () => {
        onError?.("WebSocket connection error");
      };
    } catch (err) {
      onError?.(`Failed to connect: ${err}`);
    }
  }, [
    url,
    sessionId,
    onOutput,
    onConnected,
    onDisconnected,
    onError,
    onAttached,
    onCopyModeStatus,
    reconnectAttempts,
    reconnectDelay,
    disconnect,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Cleanup on unmount - must also set disconnectedRef to prevent
  // zombie reconnections from stale onclose handlers.
  // This cleanup runs BEFORE Terminal.tsx's disconnect() during unmount,
  // so we need to mark as disconnected here as well.
  useEffect(() => {
    return () => {
      disconnectedRef.current = true;
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clearReconnectTimeout]);

  return {
    isConnected,
    isReconnecting,
    sendInput,
    sendResize,
    sendCreate,
    sendAttach,
    sendDestroy,
    sendCancelCopyMode,
    sendCheckCopyMode,
    connect,
    disconnect,
  };
}
