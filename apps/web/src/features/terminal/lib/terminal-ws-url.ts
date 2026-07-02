import { isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";

interface TerminalWsUrlParams {
  cwd?: string;
  isNewPane?: boolean;
  noTmux?: boolean;
  projectName?: string;
  sessionId: string;
  sideChatId?: string;
  sourcePaneId?: string;
  sourceTmuxWindowName?: string;
  terminalKind?: "standard" | "side_chat";
  terminalName?: string;
  tmuxWindowName?: string;
  workspaceId: string;
  workspaceName?: string;
}

function getTerminalWsBaseUrl() {
  if (typeof window !== "undefined" && isHostedAtmosOrigin()) {
    return `ws://127.0.0.1:${process.env.NEXT_PUBLIC_API_PORT || "30303"}`;
  }
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (process.env.NEXT_PUBLIC_API_PORT) {
    return `ws://localhost:${process.env.NEXT_PUBLIC_API_PORT}`;
  }
  if (typeof window !== "undefined") {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    if (process.env.NODE_ENV === "development") {
      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      if (!isLocal) {
        return `${wsProtocol}//${window.location.hostname}:30303`;
      }
    } else {
      return `${wsProtocol}//${window.location.host}`;
    }
  }
  return "ws://localhost:30303";
}

export function buildTerminalWsUrl({
  cwd,
  isNewPane,
  noTmux,
  projectName,
  sessionId,
  sideChatId,
  sourcePaneId,
  sourceTmuxWindowName,
  terminalKind,
  terminalName,
  tmuxWindowName,
  workspaceId,
  workspaceName,
}: TerminalWsUrlParams) {
  const baseWsUrl = `${getTerminalWsBaseUrl()}/ws/terminal/${sessionId}`;
  const wsParams = new URLSearchParams({
    workspace_id: workspaceId,
  });

  if (cwd) {
    wsParams.set("cwd", cwd);
  }
  if (projectName) {
    wsParams.set("project_name", projectName);
  }
  if (workspaceName) {
    wsParams.set("workspace_name", workspaceName);
  }
  if (terminalKind) {
    wsParams.set("terminal_kind", terminalKind);
  }
  if (sideChatId) {
    wsParams.set("side_chat_id", sideChatId);
  }
  if (sourcePaneId) {
    wsParams.set("source_pane_id", sourcePaneId);
  }
  if (sourceTmuxWindowName) {
    wsParams.set("source_tmux_window_name", sourceTmuxWindowName);
  }

  if (noTmux) {
    wsParams.set("mode", "shell");
    const nameForShell = terminalName || tmuxWindowName;
    if (nameForShell) {
      wsParams.set("terminal_name", nameForShell);
    }
  } else if (isNewPane) {
    const nameForNewWindow = terminalName || tmuxWindowName;
    if (nameForNewWindow) {
      wsParams.set("terminal_name", nameForNewWindow);
    }
  } else if (tmuxWindowName) {
    wsParams.set("tmux_window_name", tmuxWindowName);
  }

  return `${baseWsUrl}?${wsParams.toString()}`;
}
