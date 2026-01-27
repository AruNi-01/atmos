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
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

import { defaultTerminalOptions, atmosDarkTheme, atmosLightTheme } from "./theme";
import { useTerminalWebSocket } from "./use-terminal-websocket";
import type { TerminalProps } from "./types";

export interface TerminalRef {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  write: (data: string) => void;
  scrollToBottom: () => void;
}

const Terminal = ({
  sessionId,
  workspaceId,
  className,
  tmuxWindowName,
  projectName,
  workspaceName,
  terminalName,
  onSessionReady,
  onSessionClose,
  onSessionError,
  onTmuxWindowAssigned,
  ref,
}: TerminalProps & { ref?: React.Ref<TerminalRef> }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "disconnected">("connecting");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const currentTheme = isDark ? atmosDarkTheme : atmosLightTheme;

  // Build WebSocket URL with attach parameters if reconnecting
  const baseWsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080"}/ws/terminal/${sessionId}`;
  const wsParams = new URLSearchParams({
    workspace_id: workspaceId,
  });
  if (tmuxWindowName) {
    wsParams.set("tmux_window_name", tmuxWindowName);
  }
  if (projectName) {
    wsParams.set("project_name", projectName);
  }
  if (workspaceName) {
    wsParams.set("workspace_name", workspaceName);
  }
  if (terminalName) {
    wsParams.set("terminal_name", terminalName);
  }
  const wsUrl = `${baseWsUrl}?${wsParams.toString()}`;

  const handleOutput = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const handleConnected = useCallback(() => {
    setStatus("connected");
    // Clear any loading content and reset terminal when connected
    terminalRef.current?.clear();
    onSessionReady?.(sessionId);
  }, [sessionId, onSessionReady]);

  const handleDisconnected = useCallback(() => {
    setStatus("disconnected");
    onSessionClose?.(sessionId);
  }, [sessionId, onSessionClose]);

  const handleError = useCallback(
    (error: string) => {
      onSessionError?.(sessionId, error);
      // Only show errors in terminal after initial connection (not during connecting phase)
      // The loading overlay handles the connecting state
    },
    [sessionId, onSessionError]
  );

  const handleAttached = useCallback((history?: string) => {
    // Session attached (reconnected) to existing tmux window
    setStatus("connected");
    if (history) {
      // Write history to terminal (already scrolled back content)
      terminalRef.current?.write(history);
    }
    terminalRef.current?.write("\r\n\x1b[32m[Reconnected to session]\x1b[0m\r\n");
  }, []);

  const { isConnected, isReconnecting, sendInput, sendResize, connect, disconnect } =
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

  // Update status based on reconnecting state
  useEffect(() => {
    if (isReconnecting) {
      setStatus("reconnecting");
      terminalRef.current?.write("\r\n\x1b[33m[Reconnecting...]\x1b[0m\r\n");
    }
  }, [isReconnecting]);

  // Expose terminal methods via ref (React 19 style)
  useImperativeHandle(
    ref,
    () => ({
      focus: () => terminalRef.current?.focus(),
      blur: () => terminalRef.current?.blur(),
      clear: () => terminalRef.current?.clear(),
      write: (data: string) => terminalRef.current?.write(data),
      scrollToBottom: () => terminalRef.current?.scrollToBottom(),
    }),
    [ref]
  );


  // Update terminal theme when system theme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = currentTheme;
    }
  }, [currentTheme]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    // Create terminal instance
    const terminal = new XTerm({
      ...defaultTerminalOptions,
      theme: currentTheme,
    });

    // Create addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    // Load addons
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);

    // Open terminal in container
    terminal.open(containerRef.current);

    // Try to load WebGL addon for better performance
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

    // Fit terminal to container
    fitAddon.fit();

    // Store refs
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle terminal input
    terminal.onData((data) => {
      sendInput(data);
    });

    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      sendResize({ cols, rows });
    });

    // Connect to WebSocket
    connect();

    // Setup resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        // Use requestAnimationFrame to avoid layout thrashing
        requestAnimationFrame(() => {
          fitAddonRef.current?.fit();
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    resizeObserverRef.current = resizeObserver;

    // Focus terminal
    terminal.focus();

    return () => {
      disconnect();
      resizeObserver.disconnect();
      webglAddonRef.current?.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="terminal-padding-wrapper"
      style={{
        width: "100%",
        height: "100%",
        padding: "0", /* Removed padding to allow terminal to fill container */
        backgroundColor: "transparent",
        position: "relative",
      }}
    >
      {/* Loading overlay when connecting */}
      {status === "connecting" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--background)",
            gap: "12px",
          }}
        >
          <Loader2
            size={24}
            className="animate-spin"
            style={{
              color: isDark ? "#71717a" : "#a1a1aa",
            }}
          />
          <span
            style={{
              fontSize: "13px",
              color: isDark ? "#71717a" : "#a1a1aa",
            }}
          >
            Connecting to terminal...
          </span>
        </div>
      )}
      {/* Status indicator */}
      {status === "reconnecting" && (
        <div
          style={{
            position: "absolute",
            top: "4px",
            right: "8px",
            zIndex: 10,
            padding: "2px 8px",
            borderRadius: "4px",
            backgroundColor: "rgba(234, 179, 8, 0.2)",
            color: "#eab308",
            fontSize: "12px",
          }}
        >
          Reconnecting...
        </div>
      )}
      {status === "disconnected" && (
        <div
          style={{
            position: "absolute",
            top: "4px",
            right: "8px",
            zIndex: 10,
            padding: "2px 8px",
            borderRadius: "4px",
            backgroundColor: "rgba(239, 68, 68, 0.2)",
            color: "#ef4444",
            fontSize: "12px",
          }}
        >
          Disconnected
        </div>
      )}
      <div
        ref={containerRef}
        className={`atmos-terminal ${className || ""}`}
        style={{
          width: "100%",
          height: "100%",
          opacity: status === "connecting" ? 0 : 1,
        }}
        data-session-id={sessionId}
        data-workspace-id={workspaceId}
        data-connected={isConnected}
        data-status={status}
      />
    </div>
  );
};



Terminal.displayName = "Terminal";


export { Terminal };
export type { TerminalProps };
