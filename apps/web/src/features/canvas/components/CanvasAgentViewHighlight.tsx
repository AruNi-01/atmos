"use client";

import * as React from "react";
import {
  Box,
  SVGContainer,
  useValue,
  type BoxModel,
  type Editor,
} from "tldraw";

import type { CanvasAgentActivityStore, CanvasAgentViewState } from "../lib/canvas-agent-activity";
import type { CanvasAgentBridgeState } from "../hooks/use-canvas-agent-bridge";
import {
  AGENT_VIEW_PADDING,
  boundsFromBox,
  expandBounds,
  type CanvasAgentBounds,
} from "../lib/canvas-agent-view-bounds";

/** How long the agent view frame stays visible after the last command. */
const VIEW_HIGHLIGHT_WINDOW_MS = 45_000;

/**
 * Dashed page-space frame showing the terminal agent's working area — parity
 * with tldraw Agent starter kit `AgentViewportBoundsHighlights` / `AreaHighlight`.
 */
export function CanvasAgentViewHighlight({
  bridge,
  editor,
}: {
  bridge: CanvasAgentBridgeState;
  editor: Editor;
}) {
  const viewState = useAgentViewState(bridge.activity);
  const lastAt = React.useSyncExternalStore(
    bridge.activity.subscribe,
    () => bridge.activity.getSnapshot()?.at ?? null,
    () => bridge.activity.getSnapshot()?.at ?? null,
  );
  const recentlyActive = useTimeWindow(lastAt, VIEW_HIGHLIGHT_WINDOW_MS);

  const pageBounds = React.useMemo(() => {
    if (viewState.viewBounds) return viewState.viewBounds;
    if (!viewState.inflight) return null;
    try {
      return expandBounds(boundsFromBox(editor.getViewportPageBounds()), AGENT_VIEW_PADDING);
    } catch {
      return null;
    }
  }, [editor, viewState.inflight, viewState.viewBounds]);

  const show =
    bridge.acceptsCommands &&
    pageBounds !== null &&
    viewState.session !== "idle" &&
    (viewState.session === "active" || viewState.inflight || recentlyActive);

  if (!show || !pageBounds) {
    return null;
  }

  return (
    <AgentAreaHighlight
      pageBounds={pageBounds}
      label={`Agent ${bridge.clientId.slice(0, 6)}'s view`}
      generating={viewState.inflight}
    />
  );
}

function AgentAreaHighlight({
  pageBounds,
  label,
  generating,
}: {
  pageBounds: CanvasAgentBounds;
  label: string;
  generating: boolean;
}) {
  const boxModel: BoxModel = {
    x: pageBounds.x,
    y: pageBounds.y,
    w: pageBounds.w,
    h: pageBounds.h,
  };

  const bounds = useValue(
    "canvas-agent.view-highlight-bounds",
    () => Box.From(boxModel).expandBy(4),
    [pageBounds.x, pageBounds.y, pageBounds.w, pageBounds.h],
  );

  if (!bounds) return null;

  const minX = bounds.minX;
  const minY = bounds.minY;
  const width = bounds.maxX - minX;
  const height = bounds.maxY - minY;

  return (
    <>
      <SVGContainer
        className={`canvas-agent-view-highlight${generating ? " canvas-agent-view-highlight--active" : ""}`}
        style={{
          top: minY,
          left: minX,
          width,
          height,
        }}
      >
        {bounds.sides.map((side, j) => (
          <line
            key={`agent-view-side-${j}`}
            x1={side[0].x - bounds.minX}
            y1={side[0].y - bounds.minY}
            x2={side[1].x - bounds.minX}
            y2={side[1].y - bounds.minY}
          />
        ))}
      </SVGContainer>
      <div
        className="canvas-agent-view-highlight-label"
        style={{ top: bounds.y, left: bounds.x }}
      >
        {label}
      </div>
    </>
  );
}

function useAgentViewState(store: CanvasAgentActivityStore): CanvasAgentViewState {
  return React.useSyncExternalStore(store.subscribe, store.getViewState, store.getViewState);
}

function useTimeWindow(at: number | null, windowMs: number): boolean {
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    if (at === null) {
      setActive(false);
      return;
    }
    const remaining = at + windowMs - Date.now();
    if (remaining <= 0) {
      setActive(false);
      return;
    }
    setActive(true);
    const t = setTimeout(() => setActive(false), remaining);
    return () => clearTimeout(t);
  }, [at, windowMs]);
  return active;
}
