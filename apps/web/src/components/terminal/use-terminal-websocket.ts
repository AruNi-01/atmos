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
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

interface UseTerminalWebSocketReturn {
  isConnected: boolean;
  sendInput: (data: string) => void;
  sendResize: (size: TerminalSize) => void;
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
  reconnectAttempts = 3,
  reconnectDelay = 1000,
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);

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

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
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
            case "terminal_closed":
              if (message.session_id === sessionId) {
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
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay * reconnectCountRef.current);
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
    sendInput,
    sendResize,
    connect,
    disconnect,
  };
}
