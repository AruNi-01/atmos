"use client";

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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Terminal } from "./Terminal";
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
  const [isMounted, setIsMounted] = React.useState(false);
  
  const {
    getPanes,
    getLayout,
    setLayout,
    initWorkspace,
    addTerminal: addTerminalToStore,
    removeTerminal: removeTerminalFromStore,
    splitTerminal: splitTerminalInStore
  } = useTerminalStore();

  const { projects, isLoading: isProjectsLoading } = useProjectStore();
  const workspaceExists = React.useMemo(() => {
    return projects.some(p => p.workspaces.some(w => w.id === workspaceId));
  }, [projects, workspaceId]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && workspaceExists) {
      initWorkspace(workspaceId);
    }
  }, [workspaceId, workspaceExists, isMounted, initWorkspace]);

  const panes = getPanes(workspaceId);
  const layout = getLayout(workspaceId);
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
    removeTerminalFromStore(workspaceId, id);
  }, [workspaceId, removeTerminalFromStore]);

  const splitTerminal = useCallback((id: string, direction: "row" | "column") => {
    splitTerminalInStore(workspaceId, id, direction);
  }, [workspaceId, splitTerminalInStore]);

  const renderTile = useCallback((id: string, path: any[]) => {
    const pane = panes[id];
    if (!pane) return <div className="p-4 text-xs text-muted-foreground">Pane not found: {id}</div>;

    return (
      <MosaicWindow<string>
        path={path}
        title={pane.title}
        renderToolbar={() => (
          <div className="terminal-mosaic-toolbar">
            <div className="terminal-mosaic-toolbar-left">
              <TerminalIcon size={12} className="text-muted-foreground" />
              <span className="terminal-mosaic-title">
                {pane.title}
              </span>
            </div>
            <div className="terminal-mosaic-toolbar-right">
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
                className="terminal-mosaic-btn terminal-mosaic-btn-close"
                onClick={() => removeTerminal(id)}
                title="Close"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}
      >
        <div className="terminal-mosaic-content">
          <Terminal
            sessionId={pane.sessionId}
            workspaceId={pane.workspaceId}
            tmuxWindowName={pane.tmuxWindowName}
          />
        </div>
      </MosaicWindow>
    );
  }, [panes, splitTerminal, removeTerminal]);

  if (!isMounted || isProjectsLoading || !workspaceExists) {
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

  return (
    <div className={cn("terminal-mosaic-container", className)}>
      <Mosaic<string>
        renderTile={renderTile}
        value={layout}
        onChange={onChange}
        className="mosaic-blueprint-theme" // We can use a custom theme or blueprint
      />
    </div>
  );
});

TerminalGrid.displayName = "TerminalGrid";
