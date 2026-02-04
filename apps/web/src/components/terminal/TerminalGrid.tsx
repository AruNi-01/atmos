"use client";

// Suppress React 19 ref warnings from react-mosaic-component
// This must be imported before react-mosaic-component
import "@/lib/suppress-react19-ref-warning";

import React, { useCallback, useEffect } from "react";
import {
  Mosaic,
  MosaicWindow,
  MosaicNode,
  MosaicPath,
} from "react-mosaic-component";
import {
  X,
  Columns,
  Rows,
  Terminal as TerminalIcon,
  Loader2,
  Plus,
  Folder,
  ChevronDown,
  Maximize2,
  Bot,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Terminal, TerminalRef } from "./Terminal";
import { useTerminalStore } from "@/hooks/use-terminal-store";
import { useProjectStore } from "@/hooks/use-project-store";

import "react-mosaic-component/react-mosaic-component.css";
import "./terminal-grid.css";

interface TerminalGridProps {
  workspaceId: string;
  className?: string;
}

export interface TerminalGridHandle {
  addTerminal: (title?: string) => void;
}

export const TerminalGrid = React.forwardRef<TerminalGridHandle, TerminalGridProps>(({ workspaceId, className }, ref) => {
  // Track terminal refs for each pane to call destroy on close
  const terminalRefsMap = React.useRef<Map<string, TerminalRef>>(new Map());

  const {
    getPanes,
    getLayout,
    setLayout,
    initWorkspace,
    isWorkspaceReady,
    addTerminal: addTerminalToStore,
    removeTerminal: removeTerminalFromStore,
    splitTerminal: splitTerminalInStore,
    toggleMaximize,
    workspaceMaximizedIds,
  } = useTerminalStore();

  const { projects, isLoading: isProjectsLoading } = useProjectStore();

  // Look up project and workspace info for human-readable naming
  const workspaceInfo = (() => {
    for (const project of projects) {
      if (project.id === workspaceId) {
        return {
          projectName: project.name,
          workspaceName: "Main",
          localPath: project.mainFilePath,
        };
      }
      const workspace = project.workspaces.find(w => w.id === workspaceId);
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

  const workspaceExists = !!workspaceInfo;

  useEffect(() => {
    if (workspaceExists) {
      initWorkspace(workspaceId);
    }
  }, [workspaceId, workspaceExists, initWorkspace]);

  const panes = getPanes(workspaceId);
  const layout = getLayout(workspaceId);
  const workspaceReady = isWorkspaceReady(workspaceId);
  const hasPanes = Object.keys(panes).length > 0;

  React.useImperativeHandle(ref, () => ({
    addTerminal: (title?: string) => {
      addTerminalToStore(workspaceId, title);
    }
  }));

  const onChange = useCallback((newLayout: MosaicNode<string> | null) => {
    setLayout(workspaceId, newLayout);
  }, [workspaceId, setLayout]);

  const removeTerminal = useCallback((id: string) => {
    // First, destroy the terminal session (kills tmux window)
    const terminalRef = terminalRefsMap.current.get(id);
    if (terminalRef) {
      terminalRef.destroy();
      terminalRefsMap.current.delete(id);
    }
    // Then remove from store
    removeTerminalFromStore(workspaceId, id);
  }, [workspaceId, removeTerminalFromStore]);

  const splitTerminal = useCallback((id: string, direction: "row" | "column") => {
    splitTerminalInStore(workspaceId, id, direction);
  }, [workspaceId, splitTerminalInStore]);

  const onToggleMaximize = useCallback((id: string) => {
    toggleMaximize(workspaceId, id);
  }, [workspaceId, toggleMaximize]);

  const renderTile = useCallback((id: string, path: MosaicPath) => {
    const pane = panes[id];
    if (!pane) return <div className="p-4 text-xs text-muted-foreground">Pane not found: {id}</div>;

    return (
      <MosaicWindow<string>
        path={path}
        title={pane.title}
        className={workspaceMaximizedIds[workspaceId] === id ? "is-maximized" : ""}
        renderToolbar={() => {
          const isClaude = pane.title.toLowerCase().includes("claude");
          const statusColor = isClaude ? "bg-yellow-500" : "bg-emerald-500";

          return (
            <div className="terminal-mosaic-toolbar group/toolbar">
              <div className="terminal-mosaic-toolbar-left">
                {/* Status Dot */}
                <div className={cn("size-2 rounded-full", statusColor)} />

                {/* Title */}
                <span className="terminal-mosaic-title flex items-center gap-1.5 ml-1">
                  {pane.title}
                </span>
              </div>

              <div className="terminal-mosaic-toolbar-right">

                <div className="flex items-center gap-0.5 opacity-0 group-hover/toolbar:opacity-100 transition-opacity">
                  <button
                    className="terminal-mosaic-btn"
                    onClick={() => splitTerminal(id, "row")}
                    title="Split Horizontal"
                  >
                    <Columns size={12} />
                  </button>
                  <button
                    className="terminal-mosaic-btn"
                    onClick={() => splitTerminal(id, "column")}
                    title="Split Vertical"
                  >
                    <Rows size={12} />
                  </button>
                  <button
                    className={cn(
                      "terminal-mosaic-btn",
                      workspaceMaximizedIds[workspaceId] === id && "text-primary"
                    )}
                    onClick={() => onToggleMaximize(id)}
                    title={workspaceMaximizedIds[workspaceId] === id ? "Restore" : "Maximize"}
                  >
                    {workspaceMaximizedIds[workspaceId] === id ? (
                      <div className="relative size-3 flex items-center justify-center">
                        <Maximize2 size={11} className="scale-75 opacity-70" />
                        <div className="absolute inset-0 border-[1.5px] border-current rounded-[1px] scale-50 translate-x-0.5 -translate-y-0.5" />
                      </div>
                    ) : (
                      <Maximize2 size={11} />
                    )}
                  </button>
                  <button
                    className="terminal-mosaic-btn terminal-mosaic-btn-close ml-1"
                    onClick={() => removeTerminal(id)}
                    title="Close"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        }}
      >
        <div className="terminal-mosaic-content" data-pane-id={id}>
          <Terminal
            ref={(termRef) => {
              if (termRef) {
                terminalRefsMap.current.set(id, termRef);
              } else {
                terminalRefsMap.current.delete(id);
              }
            }}
            sessionId={pane.sessionId}
            workspaceId={pane.workspaceId}
            tmuxWindowName={pane.tmuxWindowName}
            projectName={workspaceInfo?.projectName}
            workspaceName={workspaceInfo?.workspaceName}
            isNewPane={pane.isNewPane}
            cwd={workspaceInfo?.localPath}
          />
        </div>
      </MosaicWindow>
    );
  }, [panes, splitTerminal, removeTerminal, workspaceInfo, workspaceMaximizedIds, workspaceId, onToggleMaximize]);

  // Wait for workspace to be ready before rendering any Terminal components
  // This prevents duplicate tmux window creation during initialization
  if (isProjectsLoading || !workspaceExists || !workspaceReady) {
    return (
      <div className={cn("terminal-grid-container flex items-center justify-center", className)}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (!hasPanes || !layout) {
    return (
      <div className={cn("terminal-grid-container flex items-center justify-center", className)}>
        <button
          className="flex flex-col items-center gap-4 hover:text-foreground transition-all duration-300 group"
          onClick={() => addTerminalToStore(workspaceId)}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-0 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative size-14 rounded-2xl bg-sidebar border border-border flex items-center justify-center group-hover:border-primary/50 group-hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)] transition-all duration-300">
              <Plus className="size-6 text-muted-foreground group-hover:text-primary group-hover:rotate-90 transition-all duration-500" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-semibold tracking-tight text-muted-foreground group-hover:text-foreground transition-colors">
              Initialize Workspace
            </span>
            <span className="text-[11px] text-muted-foreground/60">
              Click to add your first terminal session
            </span>
          </div>
        </button>
      </div>
    );
  }

  const maximizedId = workspaceMaximizedIds[workspaceId];

  return (
    <div
      className={cn("terminal-mosaic-container", className)}
      data-maximized-id={maximizedId || undefined}
    >
      <Mosaic<string>
        renderTile={renderTile}
        value={layout}
        onChange={onChange}
        className="atmos-mosaic-theme"
      />
    </div>
  );
});

TerminalGrid.displayName = "TerminalGrid";
