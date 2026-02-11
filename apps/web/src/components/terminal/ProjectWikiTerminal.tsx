"use client";

import React, { useCallback, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Terminal, TerminalRef } from "./Terminal";
import { useProjectStore } from "@/hooks/use-project-store";

/** Fixed tmux window name for Project Wiki generation terminal */
export const PROJECT_WIKI_WINDOW_NAME = "Generate Project Wiki";

interface ProjectWikiTerminalProps {
  workspaceId: string;
  /** Pending command to run when session is ready. Cleared after execution. */
  pendingCommand?: string | null;
  /** Called when pending command has been sent (so parent can clear it) */
  onCommandSent?: () => void;
  className?: string;
}

/**
 * Dedicated terminal for Project Wiki generation. Uses a fixed tmux window name
 * "Generate Project Wiki" so it attaches to existing or creates exactly one per workspace.
 * Does not use the terminal store - lives in the Project Wiki tab only.
 */
export const ProjectWikiTerminal: React.FC<ProjectWikiTerminalProps> = ({
  workspaceId,
  pendingCommand,
  onCommandSent,
  className,
}) => {
  const terminalRef = useRef<TerminalRef>(null);
  const sessionIdRef = useRef<string>(`pw-${workspaceId}-${Date.now()}`);

  const { projects } = useProjectStore();

  const workspaceInfo = (() => {
    for (const project of projects) {
      if (project.id === workspaceId) {
        return {
          projectName: project.name,
          workspaceName: "Main",
          localPath: project.mainFilePath,
        };
      }
      const workspace = project.workspaces.find((w) => w.id === workspaceId);
      if (workspace) {
        return {
          projectName: project.name,
          workspaceName: workspace.name,
          localPath: workspace.localPath,
        };
      }
    }
    return null;
  })();

  const isReadyRef = useRef(false);
  const lastSentRef = useRef<string | null>(null);

  const trySendPending = useCallback(() => {
    const cmd = pendingCommand?.trim();
    if (!cmd || cmd === lastSentRef.current) return;
    terminalRef.current?.sendText(cmd + "\r");
    lastSentRef.current = cmd;
    onCommandSent?.();
  }, [pendingCommand, onCommandSent]);

  const handleSessionReady = useCallback(() => {
    isReadyRef.current = true;
    trySendPending();
  }, [trySendPending]);

  // When pendingCommand is set after session was already ready, send it now
  useEffect(() => {
    if (!pendingCommand?.trim()) {
      lastSentRef.current = null;
      return;
    }
    if (isReadyRef.current) {
      trySendPending();
    }
  }, [pendingCommand, trySendPending]);

  if (!workspaceInfo) {
    return (
      <div
        className={
          className ??
          "h-full flex items-center justify-center text-muted-foreground text-sm"
        }
      >
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn("h-full w-full flex flex-col", className)}>
      <Terminal
        ref={terminalRef}
        sessionId={sessionIdRef.current}
        workspaceId={workspaceId}
        terminalName={PROJECT_WIKI_WINDOW_NAME}
        tmuxWindowName={PROJECT_WIKI_WINDOW_NAME}
        isNewPane={true}
        projectName={workspaceInfo.projectName}
        workspaceName={workspaceInfo.workspaceName}
        cwd={workspaceInfo.localPath}
        onSessionReady={handleSessionReady}
      />
    </div>
  );
};

