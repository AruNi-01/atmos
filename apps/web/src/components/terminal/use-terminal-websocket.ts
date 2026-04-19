"use client";

import { getDebugLogger, type DebugLogger } from "@atmos/shared/debug/debug-logger";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WsTerminalRequest,
  WsTerminalResponse,
  TerminalSize,
  TerminalSnapshot,
} from "./types";

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
}

interface UseTerminalWebSocketReturn {
  isConnected: boolean;
  isReconnecting: boolean;
  sendInput: (data: string) => void;
  sendTerminalReport: (data: string) => void;
  sendResize: (size: TerminalSize) => void;
  sendCreate: (workspaceId: string) => void;
  sendAttach: (workspaceId: string, tmuxWindowName: string) => void;
  sendDestroy: () => void;
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
  reconnectAttempts = 3,
  reconnectDelay = 1000,
  workspaceId,
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debugLoggerRef = useRef<DebugLogger | null>(null);
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
    } else {
      debugLoggerRef.current?.log("WS_SEND_SKIPPED", "websocket was not open for outgoing message", {
        sessionId,
        messageType: message.type,
        readyState: wsRef.current?.readyState ?? null,
      });
    }
  }, [sessionId]);

  const sendInput = useCallback(
    (data: string) => {
      debugLoggerRef.current?.log("SEND_INPUT", "sending terminal input", {
        sessionId,
        input: describeString(data),
      });
      sendMessage({
        type: "terminal_input",
        session_id: sessionId,
        data,
      });
    },
    [sessionId, sendMessage]
  );

  const sendTerminalReport = useCallback(
    (data: string) => {
      debugLoggerRef.current?.log("SEND_REPORT", "sending terminal emulator report", {
        sessionId,
        report: describeString(data),
      });
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
      debugLoggerRef.current?.log("SEND_RESIZE", "sending terminal resize", {
        sessionId,
        cols: size.cols,
        rows: size.rows,
      });
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
    debugLoggerRef.current?.log("SEND_DESTROY", "sending terminal destroy", {
      sessionId,
    });
    sendMessage({
      type: "terminal_destroy",
      session_id: sessionId,
    });
  }, [sessionId, sendMessage]);

  const disconnect = useCallback(() => {
    debugLoggerRef.current?.log("DISCONNECT", "disconnect requested", {
      sessionId,
      readyState: wsRef.current?.readyState ?? null,
    });
    void debugLoggerRef.current?.flush();
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
  }, [clearReconnectTimeout, reconnectAttempts, sessionId]);

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
      const debugLogger = getDebugLogger("terminal", apiBaseFromWsUrl(connectUrl));
      debugLoggerRef.current = debugLogger;
      debugLogger.log("WS_CONNECTING", "opening terminal websocket", {
        sessionId,
        workspaceId: workspaceId ?? null,
        url: scrubWsUrl(connectUrl),
      });
      const ws = new WebSocket(connectUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        debugLoggerRef.current?.log("WS_OPEN", "terminal websocket opened", {
          sessionId,
          workspaceId: workspaceId ?? null,
        });
        setIsConnected(true);
        setIsReconnecting(false);
        reconnectCountRef.current = 0;
        onConnected?.();
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") {
          const bytes = readBinaryMessage(event.data);
          if (bytes?.length) {
            debugLoggerRef.current?.log("WS_BINARY_OUTPUT", "received websocket binary output", {
              sessionId,
              output: describeBytes(bytes),
            });
            onOutput(bytes);
          } else if (typeof Blob !== "undefined" && event.data instanceof Blob) {
            void event.data.arrayBuffer().then((buffer) => {
              const blobBytes = new Uint8Array(buffer);
              if (blobBytes.length) {
                debugLoggerRef.current?.log("WS_BINARY_OUTPUT_BLOB", "received websocket blob output", {
                  sessionId,
                  output: describeBytes(blobBytes),
                });
                onOutput(blobBytes);
              }
            });
          }
          return;
        }

        try {
          const message: WsTerminalResponse = JSON.parse(event.data);
          debugLoggerRef.current?.log("WS_JSON_MESSAGE", "received websocket json message", {
            sessionId,
            messageType: message.type,
            snapshot:
              message.type === "terminal_created" || message.type === "terminal_attached"
                ? describeSnapshot(message.snapshot)
                : undefined,
            output:
              message.type === "terminal_output"
                ? describeString(message.data)
                : undefined,
          });

          switch (message.type) {
            case "terminal_output":
              if (message.session_id === sessionId) {
                onOutput(message.data);
              }
              break;
            case "terminal_created":
              if (message.session_id === sessionId) {
                onAttached?.(message.snapshot);
              }
              break;
            case "terminal_attached":
              // Session attached (reconnected)
              if (message.session_id === sessionId) {
                onAttached?.(message.snapshot);
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
          debugLoggerRef.current?.log("WS_RAW_TEXT_OUTPUT", "received non-json websocket text output", {
            sessionId,
            output: describeString(event.data),
          });
          // Handle non-JSON messages (raw terminal output)
          onOutput(event.data);
        }
      };

      ws.onclose = (event) => {
        debugLoggerRef.current?.log("WS_CLOSE", "terminal websocket closed", {
          sessionId,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          disconnected: disconnectedRef.current,
          reconnectCount: reconnectCountRef.current,
        });
        void debugLoggerRef.current?.flush();
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
        // Ignore errors from sockets we intentionally closed/replaced during
        // terminal teardown or remounts. These are expected and should not
        // surface as user-facing errors in the parent dialog.
        if (disconnectedRef.current || wsRef.current !== ws) {
          return;
        }
        debugLoggerRef.current?.log("WS_ERROR", "terminal websocket error", {
          sessionId,
          workspaceId: workspaceId ?? null,
        });
        onError?.("WebSocket connection error");
      };
    } catch (err) {
      debugLoggerRef.current?.log("WS_CONNECT_FAILED", "failed to create terminal websocket", {
        sessionId,
        error: String(err),
      });
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
    workspaceId,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearReconnectTimeout]);

  return {
    isConnected,
    isReconnecting,
    sendInput,
    sendTerminalReport,
    sendResize,
    sendCreate,
    sendAttach,
    sendDestroy,
    connect,
    disconnect,
  };
}

function readBinaryMessage(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return null;
}

function apiBaseFromWsUrl(wsUrl: string): string {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function scrubWsUrl(wsUrl: string): string {
  try {
    const url = new URL(wsUrl);
    url.searchParams.delete("token");
    return url.toString();
  } catch {
    return wsUrl;
  }
}

function describeSnapshot(snapshot?: TerminalSnapshot | null): Record<string, unknown> {
  if (!snapshot) {
    return { present: false };
  }

  return {
    present: true,
    cursorX: snapshot.cursor_x,
    cursorY: snapshot.cursor_y,
    cols: snapshot.cols,
    rows: snapshot.rows,
    data: describeString(snapshot.data),
  };
}

function describeString(data: string): Record<string, unknown> {
  return {
    chars: data.length,
    ...describeBytes(new TextEncoder().encode(data)),
    textHead: escapeText(data, 240),
  };
}

function describeBytes(data: Uint8Array): Record<string, unknown> {
  const head = data.slice(0, 96);
  const hexHead = Array.from(head)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
  const textHead = escapeText(new TextDecoder().decode(data.slice(0, 240)), 240);

  return {
    bytes: data.length,
    hexHead,
    textHead,
    esc: countByte(data, 0x1b),
    csi: countBytes(data, [0x1b, 0x5b]),
    osc: countBytes(data, [0x1b, 0x5d]),
    dcs: countBytes(data, [0x1b, 0x50]),
    clearScreen: countBytes(data, [0x1b, 0x5b, 0x32, 0x4a]),
    clearScrollback: countBytes(data, [0x1b, 0x5b, 0x33, 0x4a]),
    eraseDisplay: countByte(data, 0x4a),
    eraseLine: countByte(data, 0x4b),
    altScreenEnter: countBytes(data, [0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x68]),
    altScreenExit: countBytes(data, [0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x6c]),
    syncBegin: countBytes(data, [0x1b, 0x5b, 0x3f, 0x32, 0x30, 0x32, 0x36, 0x68]),
    syncEnd: countBytes(data, [0x1b, 0x5b, 0x3f, 0x32, 0x30, 0x32, 0x36, 0x6c]),
    tmuxPassthrough: countBytes(data, [
      0x1b, 0x50, 0x74, 0x6d, 0x75, 0x78, 0x3b,
    ]),
  };
}

function escapeText(value: string, limit: number): string {
  return Array.from(value)
    .slice(0, limit)
    .map((char) => {
      switch (char) {
        case "\x1b":
          return "\\x1b";
        case "\n":
          return "\\n";
        case "\r":
          return "\\r";
        case "\t":
          return "\\t";
        case "\b":
          return "\\b";
        case "\x07":
          return "\\a";
        default:
          return char;
      }
    })
    .join("");
}

function countByte(data: Uint8Array, needle: number): number {
  let count = 0;
  for (const byte of data) {
    if (byte === needle) {
      count += 1;
    }
  }
  return count;
}

function countBytes(data: Uint8Array, needle: number[]): number {
  if (needle.length === 0 || data.length < needle.length) {
    return 0;
  }

  let count = 0;
  for (let i = 0; i <= data.length - needle.length; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (data[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      count += 1;
    }
  }
  return count;
}
