"use client";

import React, { useCallback, useState, useMemo } from "react";
import { Responsive, Layout } from "react-grid-layout";
import { v4 as uuidv4 } from "uuid";
import {
  X,
  Plus,
  Columns,
  Rows,
  Terminal as TerminalIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Terminal } from "./Terminal";
import type { TerminalPaneProps } from "./types";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./terminal-grid.css";

import { useTerminalStore } from "@/hooks/use-terminal-store";

const GRID_Total_ROWS = 48; // A highly divisible number for good granularity

// Custom SizeProvider to dynamically calculate width AND rowHeight
function withDynamicGrid(WrappedComponent: React.ComponentType<any>) {
  return function WithDynamicGrid(props: any) {
    const [size, setSize] = React.useState({ width: 1200, height: 800 });
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (!ref.current) return;

      const updateSize = () => {
        if (ref.current) {
          const { width, height } = ref.current.getBoundingClientRect();
          setSize({ width, height });
        }
      };

      // Initial size
      updateSize();

      // Observer
      const observer = new ResizeObserver((entries) => {
        if (entries[0]) {
          // We use contentRect or boundingClientRect logic
          const { width, height } = entries[0].contentRect;
          setSize({ width, height });
        }
      });
      observer.observe(ref.current);
      return () => observer.disconnect();
    }, []);

    // Calculate dynamic row height based on container height
    // We subtract a small buffer (32px) to account for the status bar and avoid overlap.
    const containerHeight = Math.max(1, size.height - 14);
    const dynamicRowHeight = Math.max(1, containerHeight / GRID_Total_ROWS);

    return (
      <div
        ref={ref}
        className={props.className}
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      >
        <WrappedComponent
          {...props}
          width={size.width}
          rowHeight={dynamicRowHeight}
        />
      </div>
    );

  };
}

const ResponsiveGridLayout = withDynamicGrid(Responsive);

interface TerminalGridProps {
  workspaceId: string;
  className?: string;
}

interface GridTerminalPane extends TerminalPaneProps {
  grid: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface TerminalGridHandle {
  addTerminal: (title?: string) => void;
}

export const TerminalGrid = React.forwardRef<TerminalGridHandle, TerminalGridProps>(({ workspaceId, className }, ref) => {
  const {
    getPanes,
    setPanes,
    addTerminal: addTerminalToStore,
    removeTerminal: removeTerminalFromStore,
    splitTerminal: splitTerminalInStore
  } = useTerminalStore();

  const panes = getPanes(workspaceId);

  // Expose addTerminal method via ref
  React.useImperativeHandle(ref, () => ({
    addTerminal: (title?: string) => {
      addTerminalToStore(workspaceId, title);
    }
  }));

  const layouts = useMemo(() => {
    const lg: Layout = Object.values(panes).map((pane) => ({
      i: pane.id,
      ...pane.grid,
    }));
    return { lg };
  }, [panes]);

  const onLayoutChange = (currentLayout: Layout, _allLayouts: Partial<Record<string, Layout>>) => {
    const next = { ...panes };
    currentLayout.forEach((item) => {
      if (next[item.i]) {
        next[item.i] = {
          ...next[item.i],
          grid: { x: item.x, y: item.y, w: item.w, h: item.h },
        };
      }
    });
    setPanes(workspaceId, next);
  };

  const removeTerminal = useCallback((id: string) => {
    removeTerminalFromStore(workspaceId, id);
  }, [workspaceId, removeTerminalFromStore]);

  const splitTerminal = useCallback((id: string, direction: "horizontal" | "vertical") => {
    splitTerminalInStore(workspaceId, id, direction);
  }, [workspaceId, splitTerminalInStore]);

  return (
    <div className={cn("terminal-grid-container", className)}>
      <ResponsiveGridLayout
        className="terminal-grid-layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={20}
        dragConfig={{ handle: ".terminal-grid-toolbar-title" }}
        onLayoutChange={onLayoutChange}
        margin={[0, 0]} // Seamless implementation
        containerPadding={[0, 0]}
      >
        {Object.values(panes).map((pane) => (
          <div key={pane.id} data-grid={pane.grid} className="terminal-grid-item">
            <div className="terminal-grid-toolbar">
              <div className="terminal-grid-toolbar-title">
                <TerminalIcon size={12} className="text-muted-foreground mr-1" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] select-none">
                  {pane.title}
                </span>
              </div>

              <div className="flex items-center gap-0.5">
                <button
                  className="terminal-grid-toolbar-btn"
                  onClick={() => splitTerminal(pane.id, "horizontal")}
                  title="Split Right"
                >
                  <Columns size={12} />
                </button>
                <button
                  className="terminal-grid-toolbar-btn"
                  onClick={() => splitTerminal(pane.id, "vertical")}
                  title="Split Down"
                >
                  <Rows size={12} />
                </button>
                <button
                  className="terminal-grid-toolbar-btn terminal-grid-toolbar-btn-close ml-1"
                  onClick={() => removeTerminal(pane.id)}
                  title="Close"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            <div className="terminal-grid-content">
              <Terminal
                sessionId={pane.sessionId}
                workspaceId={pane.workspaceId}
              />
            </div>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
});

TerminalGrid.displayName = "TerminalGrid";

