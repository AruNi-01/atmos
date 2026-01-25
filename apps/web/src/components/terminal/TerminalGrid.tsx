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

// Custom WidthProvider to avoid ESM export issues in RGL v2
function withWidth<P extends { width: number }>(
  WrappedComponent: React.ComponentType<P>
) {
  return function WithWidth(props: Omit<P, "width"> & { className?: string }) {
    const [width, setWidth] = React.useState(1200);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (!ref.current) return;
      const observer = new ResizeObserver((entries) => {
        if (entries[0]) {
          setWidth(entries[0].contentRect.width);
        }
      });
      observer.observe(ref.current);
      return () => observer.disconnect();
    }, []);

    return (
      <div ref={ref} className={props.className} style={{ width: "100%", height: "100%" }}>
        <WrappedComponent {...(props as P)} width={width} />
      </div>
    );
  };
}

const ResponsiveGridLayout = withWidth(Responsive);

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

export function TerminalGrid({ workspaceId, className }: TerminalGridProps) {
  const [panes, setPanes] = useState<Record<string, GridTerminalPane>>(() => {
    const initialId = uuidv4();
    return {
      [initialId]: {
        id: initialId,
        title: "Terminal 1",
        sessionId: uuidv4(),
        workspaceId,
        grid: { x: 0, y: 0, w: 12, h: 8 }, // Default to full width
      },
    };
  });

  const [counter, setCounter] = useState(2);

  const layouts = useMemo(() => {
    const lg: Layout = Object.values(panes).map((pane) => ({
      i: pane.id,
      ...pane.grid,
    }));
    return { lg };
  }, [panes]);

  const onLayoutChange = (currentLayout: Layout, _allLayouts: Partial<Record<string, Layout>>) => {
    setPanes((prev) => {
      const next = { ...prev };
      currentLayout.forEach((item) => {
        if (next[item.i]) {
          next[item.i] = {
            ...next[item.i],
            grid: { x: item.x, y: item.y, w: item.w, h: item.h },
          };
        }
      });
      return next;
    });
  };

  const removeTerminal = useCallback((id: string) => {
    setPanes((prev) => {
      const next = { ...prev };
      delete next[id];
      // If last one removed, add one back
      if (Object.keys(next).length === 0) {
        const newId = uuidv4();
        next[newId] = {
          id: newId,
          title: "Terminal 1",
          sessionId: uuidv4(),
          workspaceId,
          grid: { x: 0, y: 0, w: 12, h: 8 },
        };
      }
      return next;
    });
  }, [workspaceId]);

  const splitTerminal = useCallback((id: string, direction: "horizontal" | "vertical") => {
    setPanes((prev) => {
      const target = prev[id];
      if (!target) return prev;

      const newId = uuidv4();
      const next = { ...prev };

      if (direction === "vertical") {
        // Current pane takes top half, new pane takes bottom half
        const newH = Math.max(1, Math.floor(target.grid.h / 2));
        next[id] = {
          ...target,
          grid: { ...target.grid, h: newH },
        };
        next[newId] = {
          id: newId,
          title: `Terminal ${counter}`,
          sessionId: uuidv4(),
          workspaceId,
          grid: { x: target.grid.x, y: target.grid.y + newH, w: target.grid.w, h: newH },
        };
      } else {
        // Current pane takes left half, new pane takes right half
        const newW = Math.max(1, Math.floor(target.grid.w / 2));
        next[id] = {
          ...target,
          grid: { ...target.grid, w: newW },
        };
        next[newId] = {
          id: newId,
          title: `Terminal ${counter}`,
          sessionId: uuidv4(),
          workspaceId,
          grid: { x: target.grid.x + newW, y: target.grid.y, w: newW, h: target.grid.h },
        };
      }

      setCounter((c) => c + 1);
      return next;
    });
  }, [counter, workspaceId]);

  return (
    <div className={cn("terminal-grid-container", className)}>
      <ResponsiveGridLayout
        className="terminal-grid-layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={80}
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
}
