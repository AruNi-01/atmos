"use client";

import * as React from "react";
import { useEditor, useValue } from "tldraw";
import {
  Bot,
  ChevronsRight,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Network,
  Sparkles,
} from "lucide-react";
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
 * floating Agent badge. Following itself is delegated to tldraw — the
 * presence store writes a `TLInstancePresence` record into `editor.store`
 * and the overlay calls `editor.startFollowingUser` / `zoomToUser` per the
 * tldraw User Following docs.
 */
export function CanvasAgentOverlay({
  bridge,
}: {
  bridge: CanvasAgentBridgeState;
}) {
  const editor = useEditor();
  const agents = useSyncPresence(bridge.presence);
  // Read the followed user id directly from the editor so manual pan/zoom
  // (which tldraw uses to silently stop following) updates the UI without an
  // explicit notification path.
  const followingUserId = useValue(
    "canvas-agent.followingUserId",
    () => editor.getInstanceState().followingUserId,
    [editor],
  );
  const followedId =
    followingUserId && followingUserId.startsWith("agent:")
      ? followingUserId.slice("agent:".length)
      : null;

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
          onJump={() => {
            bridge.presence.jumpToActor(agent.actor_id);
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
  onJump,
}: {
  agent: ReturnType<CanvasAgentPresenceStore["getSnapshot"]>[number];
  editor: ReturnType<typeof useEditor>;
  isFollowed: boolean;
  onToggleFollow: () => void;
  onJump: () => void;
}) {
  // The overlay container is `absolute inset-0` inside <Tldraw>, so child
  // `left/top` are interpreted in tldraw's container-local frame. tldraw's
  // `pageToScreen` returns *document-space* coords (it adds the editor's
  // `screenBounds.{x,y}`), which would over-shift the badge by the editor
  // container's offset within the page. Use `pageToViewport` instead — it
  // converts page coords directly into the editor's container-local frame.
  const containerPos = React.useMemo(() => {
    if (!agent.last_bounds) return null;
    const { x, y } = agent.last_bounds;
    try {
      const point = editor.pageToViewport({ x, y });
      return point;
    } catch {
      return null;
    }
  }, [agent.last_bounds, editor]);

  if (!containerPos) {
    return null;
  }

  return (
    <div
      style={{ left: containerPos.x, top: containerPos.y - 28 }}
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
        title="Jump to agent (zoomToUser)"
        aria-label="Jump to agent"
        onClick={onJump}
        className={cn(
          "ml-0.5 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground",
          "hover:bg-foreground/10 hover:text-foreground",
        )}
      >
        <Crosshair className="size-3" />
      </button>
      <button
        type="button"
        title={isFollowed ? "Stop following agent" : "Follow agent"}
        aria-label={isFollowed ? "Stop following agent" : "Follow agent"}
        onClick={onToggleFollow}
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full text-muted-foreground",
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
            bridge.acceptsCommands ? "text-foreground" : "text-muted-foreground",
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
          title={`${activeCount} active agent${activeCount === 1 ? "" : "s"}`}
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

// Re-exported for tests / callers who want to embed the blurb elsewhere.
export const CANVAS_AGENT_INSTRUCTION_BLURB = AGENT_INSTRUCTION_BLURB;
export const CANVAS_AGENT_SKILL_PATH = SKILL_PATH;

// Hint export to silence the "Network unused" warning while keeping the icon
// available for future bridge-status indicator variants.
export const _CanvasAgentOverlayIcons = { Network, ChevronsRight };
