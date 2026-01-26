"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
} from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

import { defaultTerminalOptions, atmosDarkTheme } from "./theme";
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
  onSessionReady,
  onSessionClose,
  onSessionError,
  ref,
}: TerminalProps & { ref?: React.Ref<TerminalRef> }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // WebSocket connection
  const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080"}/ws/terminal/${sessionId}?workspace_id=${workspaceId}`;

  const handleOutput = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const handleConnected = useCallback(() => {
    onSessionReady?.(sessionId);
  }, [sessionId, onSessionReady]);

  const handleDisconnected = useCallback(() => {
    onSessionClose?.(sessionId);
  }, [sessionId, onSessionClose]);

  const handleError = useCallback(
    (error: string) => {
      onSessionError?.(sessionId, error);
      terminalRef.current?.write(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`);
    },
    [sessionId, onSessionError]
  );

  const { isConnected, sendInput, sendResize, connect, disconnect } =
    useTerminalWebSocket({
      url: wsUrl,
      sessionId,
      workspaceId, // Pass workspaceId for automatic compensation
      onOutput: handleOutput,
      onConnected: handleConnected,
      onDisconnected: handleDisconnected,
      onError: handleError,
    });

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


  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    // Create terminal instance
    const terminal = new XTerm({
      ...defaultTerminalOptions,
      theme: atmosDarkTheme,
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

    // Display welcome message
    terminal.write("\x1b[1;38;5;39mATMOS\x1b[0m \x1b[38;5;244mTerminal Workspace\x1b[0m\r\n\r\n");

    if (!isConnected) {
      terminal.write("\x1b[33mConnecting...\x1b[0m\r\n");
    }


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
        paddingLeft: "2px",
        paddingTop: "2px",
        backgroundColor: atmosDarkTheme.background,
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        className={`atmos-terminal ${className || ""}`}
        style={{
          width: "100%",
          height: "100%",
        }}
        data-session-id={sessionId}
        data-workspace-id={workspaceId}
        data-connected={isConnected}
      />
    </div>
  );
};



Terminal.displayName = "Terminal";


export { Terminal };
export type { TerminalProps };
