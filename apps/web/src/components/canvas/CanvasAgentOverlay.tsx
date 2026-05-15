"use client";

import * as React from "react";
import { useEditor, type TLShapeId } from "tldraw";
import { Bot, ChevronsRight, Copy, Eye, EyeOff, Network, Sparkles } from "lucide-react";
import { Button, cn, toastManager } from "@workspace/ui";

import type { CanvasAgentBridgeState } from "./use-canvas-agent-bridge";
import type { CanvasAgentPresenceStore } from "./canvas-agent-presence";

const SKILL_PATH = "~/.atmos/skills/.system/atmos-canvas-agent/SKILL.md";
const AGENT_INSTRUCTION_BLURB = `You can drive my open Atmos Canvas directly from the terminal.

Read the skill at: ${SKILL_PATH}

Use \`atmos canvas <verb> [--flags...]\` to:
- sketch architecture diagrams (create-note, create-frame, create-geo, create-arrow)
- arrange shapes (layout-row / layout-column / layout-grid, select, move)
- inspect the canvas (status, get-state) before mutating
- delete safely with --confirm

Always run \`atmos canvas status\` first to confirm the bridge is online.`;

/**
 * Mounted inside <Tldraw> so it can use `useEditor()` to translate the
 * agent's last-known page-space bounds into screen coordinates for the
 * floating Agent badge.
 */
export function CanvasAgentOverlay({
  bridge,
}: {
  bridge: CanvasAgentBridgeState;
}) {
  const editor = useEditor();
  const agents = useSyncPresence(bridge.presence);
  const followedId = useSyncFollowed(bridge.presence);

  // Auto-pan to followed agent's most recent activity bounds. We do this in a
  // tldraw `react` listener so it follows camera transforms; using
  // `setTimeout` keeps it cooperative with user input.
  React.useEffect(() => {
    if (!followedId) return;
    const agent = agents.find((a) => a.actor_id === followedId);
    if (!agent?.last_bounds) return;
    const { x, y, w, h } = agent.last_bounds;
    if (w <= 0 || h <= 0) return;
    const timer = setTimeout(() => {
      try {
        const ids = agent.last_shape_ids.filter((id) =>
          editor.getShape(id as TLShapeId),
        );
        if (ids.length) {
          editor.select(...(ids as TLShapeId[]));
          editor.zoomToSelection({ animation: { duration: 200 } });
        } else {
          editor.centerOnPoint({ x: x + w / 2, y: y + h / 2 }, { animation: { duration: 200 } });
        }
      } catch (err) {
        console.debug("[canvas-agent] follow agent failed", err);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [editor, followedId, agents]);

  if (!agents.length && !bridge.acceptsCommands) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[2]">
      {agents.map((agent) => (
        <AgentBadge
          key={agent.actor_id}
          agent={agent}
          editor={editor}
          isFollowed={followedId === agent.actor_id}
          onToggleFollow={() => {
            bridge.presence.setFollowedActor(
              followedId === agent.actor_id ? null : agent.actor_id,
            );
          }}
        />
      ))}
    </div>
  );
}

function AgentBadge({
  agent,
  editor,
  isFollowed,
  onToggleFollow,
}: {
  agent: ReturnType<CanvasAgentPresenceStore["getSnapshot"]>[number];
  editor: ReturnType<typeof useEditor>;
  isFollowed: boolean;
  onToggleFollow: () => void;
}) {
  // Re-render on camera tick by reading viewport/screen bounds inside render
  // (tldraw notifies React via its store).
  const screenPos = React.useMemo(() => {
    if (!agent.last_bounds) return null;
    const { x, y } = agent.last_bounds;
    try {
      const point = editor.pageToScreen({ x, y });
      return point;
    } catch {
      return null;
    }
  }, [agent.last_bounds, editor]);

  if (!screenPos) {
    return null;
  }

  return (
    <div
      style={{ left: screenPos.x, top: screenPos.y - 28 }}
      className={cn(
        "pointer-events-auto absolute flex items-center gap-1 rounded-full px-2 py-0.5",
        "border border-border bg-background/95 shadow-md backdrop-blur",
        isFollowed && "ring-2 ring-offset-1 ring-offset-background",
      )}
    >
      <span
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: agent.color }}
      />
      <span className="max-w-[180px] truncate text-xs font-medium text-foreground">
        {agent.name}
      </span>
      <span className="hidden text-[10px] text-muted-foreground sm:inline">
        · {agent.last_command}
      </span>
      <button
        type="button"
        title={isFollowed ? "Stop following agent" : "Follow agent"}
        onClick={onToggleFollow}
        className={cn(
          "ml-0.5 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground",
          "hover:bg-foreground/10 hover:text-foreground",
          isFollowed && "text-foreground",
        )}
      >
        {isFollowed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
    </div>
  );
}

/**
 * Button cluster that lives in the CanvasView SharePanel. Renders the
 * "Allow terminal/CLI control" toggle, a "Copy Agent Instructions" button,
 * and a compact agent count badge.
 */
export function CanvasAgentBridgeControls({
  bridge,
  iconButtonClass,
}: {
  bridge: CanvasAgentBridgeState;
  iconButtonClass: string;
}) {
  const agents = useSyncPresence(bridge.presence);
  const activeCount = agents.length;

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(AGENT_INSTRUCTION_BLURB);
      toastManager.add({
        title: "Canvas",
        description: "Agent instructions copied to clipboard.",
        type: "success",
      });
    } catch (err) {
      toastManager.add({
        title: "Canvas",
        description:
          err instanceof Error
            ? `Failed to copy: ${err.message}`
            : "Failed to copy to clipboard",
        type: "error",
      });
    }
  }, []);

  const toggleAccepts = React.useCallback(() => {
    bridge.setAcceptsCommands(!bridge.acceptsCommands);
  }, [bridge]);

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleAccepts}
        aria-pressed={bridge.acceptsCommands}
        title={
          bridge.acceptsCommands
            ? "Disable terminal/CLI control of this Canvas"
            : "Allow terminal/CLI control of this Canvas (atmos canvas …)"
        }
        className={cn(
          iconButtonClass,
          bridge.acceptsCommands && "bg-foreground/10 text-foreground",
        )}
      >
        <Bot
          className={cn(
            "size-3.5 transition-colors",
            bridge.acceptsCommands ? "text-emerald-500" : "text-muted-foreground",
          )}
        />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void handleCopy()}
        title="Copy agent instructions to clipboard"
        className={iconButtonClass}
      >
        <Copy className="size-3.5" />
      </Button>
      {activeCount > 0 && (
        <div
          title={`${activeCount} active terminal agent${activeCount === 1 ? "" : "s"}`}
          className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          <Sparkles className="size-3" />
          {activeCount}
        </div>
      )}
    </div>
  );
}

function useSyncPresence(presence: CanvasAgentPresenceStore) {
  return React.useSyncExternalStore(
    presence.subscribe,
    presence.getSnapshot,
    presence.getSnapshot,
  );
}

function useSyncFollowed(presence: CanvasAgentPresenceStore) {
  return React.useSyncExternalStore(
    presence.subscribe,
    presence.getFollowedActor,
    presence.getFollowedActor,
  );
}

// Re-exported for tests / callers who want to embed the blurb elsewhere.
export const CANVAS_AGENT_INSTRUCTION_BLURB = AGENT_INSTRUCTION_BLURB;
export const CANVAS_AGENT_SKILL_PATH = SKILL_PATH;

// Hint export to silence the "Network unused" warning while keeping the icon
// available for future bridge-status indicator variants.
export const _CanvasAgentOverlayIcons = { Network, ChevronsRight };
