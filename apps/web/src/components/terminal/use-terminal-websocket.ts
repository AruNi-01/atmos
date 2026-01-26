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
  connect: () => void;
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
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
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
          }
        } catch {
          // Handle non-JSON messages (raw terminal output)
          onOutput(event.data);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        onDisconnected?.();

        // Attempt to reconnect
        if (reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++;
          setIsReconnecting(true);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
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
    reconnectAttempts,
    reconnectDelay,
  ]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    reconnectCountRef.current = reconnectAttempts; // Prevent reconnection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsReconnecting(false);
  }, [clearReconnectTimeout, reconnectAttempts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
    connect,
    disconnect,
  };
}
