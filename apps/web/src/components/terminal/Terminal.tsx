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
import { Unicode11Addon } from "@xterm/addon-unicode11";
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
  sendText: (data: string) => void;
  scrollToBottom: () => void;
  /** Destroy the terminal session (kills tmux window) */
  destroy: () => void;
}

// ── Dynamic title helpers ──────────────────────────────────────────────
// These are used by the OSC 9999 handler to produce clean tab titles.

/** Known multi-word commands where the subcommand is meaningful */
const MULTI_WORD_CMDS = new Set([
  "cargo", "npm", "yarn", "pnpm", "bun", "docker", "git",
  "kubectl", "go", "just", "make", "python", "ruby", "node",
]);

/**
 * Extract a human-readable command name from a full command string.
 * Strips sudo/env prefixes and keeps relevant subcommands.
 *  "sudo cargo watch -x run" → "cargo watch"
 *  "vim src/main.rs"         → "vim"
 *  "RUST_LOG=debug cargo r"  → "cargo r"
 */
function extractCommandName(fullCommand: string): string {
  // Strip leading env-var assignments (FOO=bar) and sudo/env prefixes
  const stripped = fullCommand
    .replace(/^(\s*(sudo|command|env)\s+)*/g, "")
    .replace(/^\s*\S+=\S+\s+/g, "")
    .trim();

  const parts = stripped.split(/\s+/);
  if (parts.length === 0) return fullCommand;

  const cmd = parts[0];
  // For multi-word commands, include the subcommand
  if (MULTI_WORD_CMDS.has(cmd) && parts.length > 1) {
    return `${cmd} ${parts[1]}`;
  }
  return cmd;
}

/**
 * Shorten an absolute path for display in a tab title.
 * "/Users/john/projects/atmos/src" → "atmos/src"
 * "/home/user"                     → "~"
 */
function shortenPath(fullPath: string): string {
  if (!fullPath || fullPath === "/") return "/";
  const parts = fullPath.split("/").filter(Boolean);
  if (parts.length <= 2) return fullPath;
  // Show last 2 path components
  return parts.slice(-2).join("/");
}

const Terminal = ({
  sessionId,
  workspaceId,
  className,
  tmuxWindowName,
  projectName,
  workspaceName,
  terminalName,
  isNewPane,
  onSessionReady,
  onSessionClose,
  onSessionError,
  onTmuxWindowAssigned,
  noTmux,
  cwd,
  onData, // New prop
  readOnly,
  onInputWhileReadOnly,
  onTitleChange,
  ref,
}: TerminalProps & { ref?: React.Ref<TerminalRef>; onInputWhileReadOnly?: () => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const readOnlyRef = useRef(readOnly);
  // Keep onTitleChange callback ref in sync to avoid stale closures in the OSC handler
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;

  // Track last emitted title and pending CMD_START timer for debounce/dedup
  const lastTitleRef = useRef<string>("");
  const cmdStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates wheel delta for smooth trackpad scrolling (same approach as agentboard)
  const wheelAccumRef = useRef(0);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "disconnected">("connecting");
  // Ref to hold sendResize so handleConnected can call it without circular dependency
  const sendResizeRef = useRef<(size: { cols: number; rows: number }) => void>(() => {});
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const currentTheme = isDark ? atmosDarkTheme : atmosLightTheme;

  // For NEW panes: use terminal_name to CREATE a new tmux window
  // For EXISTING panes: use tmux_window_name to ATTACH to existing tmux window
  const getTerminalWsUrl = () => {
    if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (!isLocal) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.hostname}:8080`;
      }
    }
    return "ws://localhost:8080";
  };
  const baseWsUrl = `${getTerminalWsUrl()}/ws/terminal/${sessionId}`;
  const wsParams = new URLSearchParams({
    workspace_id: workspaceId,
  });

  if (cwd) {
    wsParams.set("cwd", cwd);
  }

  // Common params
  if (projectName) {
    wsParams.set("project_name", projectName);
  }
  if (workspaceName) {
    wsParams.set("workspace_name", workspaceName);
  }

  // If noTmux is requested, tell backend to skip tmux
  if (noTmux) {
    wsParams.set("mode", "shell");
    // Still pass terminal_name for metadata display in Terminal Manager
    const nameForShell = terminalName || tmuxWindowName;
    if (nameForShell) {
      wsParams.set("terminal_name", nameForShell);
    }
  } else {
    // Standard Tmux Logic
    if (isNewPane) {
      // New pane: send terminal_name to create a new window with this name
      // Do NOT send tmux_window_name to avoid triggering attach logic
      const nameForNewWindow = terminalName || tmuxWindowName;
      if (nameForNewWindow) {
        wsParams.set("terminal_name", nameForNewWindow);
      }
    } else {
      // Existing pane (from saved layout or reconnection): attach to existing window
      if (tmuxWindowName) {
        wsParams.set("tmux_window_name", tmuxWindowName);
      }
    }
  }
  const wsUrl = `${baseWsUrl}?${wsParams.toString()}`;

  const handleOutput = useCallback((data: string) => {
    terminalRef.current?.write(data);
    onData?.(data); // Also forward output to parent (needed for URL detection)
  }, [onData]);

  const handleConnected = useCallback(() => {
    setStatus("connected");

    // Belt-and-suspenders: send current terminal dimensions immediately after WS opens.
    // This ensures the backend PTY has the correct size even if URL params were not processed.
    if (terminalRef.current) {
      sendResizeRef.current({ cols: terminalRef.current.cols, rows: terminalRef.current.rows });
    }
    // Re-fit to ensure terminal matches current container dimensions
    fitAddonRef.current?.fit();
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

  const { isConnected, isReconnecting, sendInput, sendResize, sendDestroy, connect, disconnect } =
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

  // Keep sendResize ref in sync (breaks circular dependency with handleConnected)
  sendResizeRef.current = sendResize;

  const uiStatus = isReconnecting ? "reconnecting" : status;

  // Update terminal when reconnecting
  useEffect(() => {
    if (isReconnecting) {
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
      sendText: (data: string) => sendInput(data),
      scrollToBottom: () => terminalRef.current?.scrollToBottom(),
      destroy: () => {
        // Send destroy message to kill tmux window before disconnecting
        sendDestroy();
        disconnect();
      },
    }),
    [ref, sendDestroy, disconnect]
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
    const unicode11Addon = new Unicode11Addon();
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = "11";
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);

    // Open terminal in container
    terminal.open(containerRef.current);

    // Register OSC 9999 handler for dynamic tab title updates.
    // The shell shim emits: \033]9999;CMD_START:<command>\007
    //                    or: \033]9999;CMD_END:<cwd>\007
    // xterm.js intercepts these sequences and never renders them.
    //
    // Optimizations:
    //   1. Dedup — skip update if the new title equals the current one
    //   2. Debounce CMD_START — short-lived commands (ls, pwd, echo) finish
    //      before the timer fires, so CMD_END cancels the pending CMD_START
    //      and the title never flickers.
    const CMD_START_DELAY_MS = 150;

    terminal.parser.registerOscHandler(9999, (data: string) => {
      const colonIdx = data.indexOf(":");
      if (colonIdx === -1) return true;

      const metaType = data.substring(0, colonIdx);
      const payload = data.substring(colonIdx + 1);

      if (metaType === "CMD_START") {
        const title = extractCommandName(payload);
        // Cancel any previous pending CMD_START
        if (cmdStartTimerRef.current) {
          clearTimeout(cmdStartTimerRef.current);
        }
        // Debounce: only show the command name if it runs longer than the threshold
        cmdStartTimerRef.current = setTimeout(() => {
          cmdStartTimerRef.current = null;
          if (title !== lastTitleRef.current) {
            lastTitleRef.current = title;
            onTitleChangeRef.current?.(title);
          }
        }, CMD_START_DELAY_MS);
      } else if (metaType === "CMD_END") {
        // Cancel any pending CMD_START — the command finished fast
        if (cmdStartTimerRef.current) {
          clearTimeout(cmdStartTimerRef.current);
          cmdStartTimerRef.current = null;
        }
        const title = shortenPath(payload);
        if (title !== lastTitleRef.current) {
          lastTitleRef.current = title;
          onTitleChangeRef.current?.(title);
        }
      }

      return true; // consumed — don't render the sequence
    });

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

    // Store refs BEFORE fit so handlers can access them
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle terminal input
    terminal.onData((data) => {
      if (readOnlyRef.current) {
        onInputWhileReadOnly?.();
        return;
      }
      sendInput(data);
      onData?.(data); // Notify parent
    });

    // IMPORTANT: Register onResize BEFORE fitAddon.fit() so the initial
    // resize event (from default 80x24 to actual size) is captured.
    terminal.onResize(({ cols, rows }) => {
      sendResize({ cols, rows });
    });

    // Fit terminal to container (now onResize handler is registered to capture this)
    fitAddon.fit();

    // Connect to WebSocket with initial terminal dimensions in URL.
    // This ensures the backend creates the PTY with the correct size from the start,
    // preventing garbled output from cols/rows mismatch.
    const connectUrl = `${wsUrl}&cols=${terminal.cols}&rows=${terminal.rows}`;
    connect(connectUrl);

    // Forward wheel events to tmux for scrollback (matching agentboard approach).
    // With scrollback: 0, xterm.js has no local scrollback. Instead, wheel events
    // are converted to SGR mouse sequences and sent through the PTY to tmux.
    // tmux (with mouse: on) enters copy-mode on scroll-up, providing persistent
    // scrollback that survives workspace switches and reconnections.
    const WHEEL_STEP = 30; // Accumulation threshold to avoid trackpad spam
    terminal.attachCustomWheelEventHandler((ev) => {
      // Don't intercept wheel over HTML overlays
      const target = ev.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) {
        return true;
      }
      // If user has active text selection, let them scroll to extend it
      if (terminal.hasSelection()) return true;
      // Shift+scroll = horizontal scroll, let browser handle
      if (ev.shiftKey) return true;

      wheelAccumRef.current += ev.deltaY;

      // Convert accumulated delta to SGR mouse wheel sequences
      // SGR encoding: ESC[<button;col;rowM — button 64 = scroll up, 65 = scroll down
      const col = Math.floor(terminal.cols / 2);
      const row = Math.floor(terminal.rows / 2);

      while (Math.abs(wheelAccumRef.current) >= WHEEL_STEP) {
        const down = wheelAccumRef.current > 0;
        wheelAccumRef.current += down ? -WHEEL_STEP : WHEEL_STEP;
        const button = down ? 65 : 64;
        sendInput(`\x1b[<${button};${col};${row}M`);
      }

      return false; // We handled it — prevent xterm.js local scroll
    });

    // Setup resize observer with debounce to coalesce rapid resize events.
    // 150ms debounce (matching agentboard) to prevent rapid resize bursts.
    // No clear() needed: with scrollback: 0 and alternate screen enabled (default),
    // tmux redraws cleanly on resize without duplication.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          if (fitAddonRef.current) {
            fitAddonRef.current.fit();
          }
        });
      }, 150);
    });

    resizeObserver.observe(containerRef.current);
    resizeObserverRef.current = resizeObserver;

    // Focus terminal
    terminal.focus();

    return () => {
      disconnect();
      resizeObserver.disconnect();
      if (cmdStartTimerRef.current) clearTimeout(cmdStartTimerRef.current);
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
        padding: "8px 12px", /* Spacing around xterm — must be on wrapper, not xterm mount, so FitAddon measures correctly */
        backgroundColor: "transparent",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Loading overlay when connecting */}
      {uiStatus === "connecting" && (
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
            suppressHydrationWarning
            style={{
              color: isDark ? "#71717a" : "#a1a1aa",
            }}
          />
          <span
            suppressHydrationWarning
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
      {uiStatus === "reconnecting" && (
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
      {uiStatus === "disconnected" && (
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
        suppressHydrationWarning
        style={{
          width: "100%",
          height: "100%",
          opacity: uiStatus === "connecting" ? 0 : 1,
          backgroundColor: currentTheme.background,
        }}
        data-session-id={sessionId}
        data-workspace-id={workspaceId}
        data-connected={isConnected}
        data-status={uiStatus}
      />
    </div>
  );
};



Terminal.displayName = "Terminal";


export { Terminal };
export type { TerminalProps };
