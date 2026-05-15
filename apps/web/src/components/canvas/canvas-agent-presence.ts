"use client";

/**
 * APP-015 Canvas Agent Presence — TLInstancePresence-backed registry of
 * "virtual" terminal agents driving the Canvas.
 *
 * Implementation contract (TECH.md §9):
 *
 *  - Every accepted dispatch creates/refreshes a `TLInstancePresence` record
 *    in `editor.store` (presence scope, NOT persisted to `document_json`).
 *  - `userId` follows the `agent:<actor_id>` convention so callers can pass
 *    it to `editor.startFollowingUser(userId)` and `editor.zoomToUser(userId)`
 *    directly, exactly as the tldraw User Following docs specify.
 *  - `camera` + `screenBounds` are synthesised so the follower's viewport
 *    math (`getViewportPageBoundsForFollowing`) frames the agent's latest
 *    changed bounds. When no bounds are known yet, we mirror the human
 *    user's current viewport so the agent simply appears at the user's
 *    location.
 *  - When the bridge unregisters (overlay unmount) or TTL elapses, the
 *    record is removed from `editor.store` and any in-flight follow is
 *    cancelled so we don't strand the user on a ghost agent.
 *
 * The store also drives the HTML "agent activity chip" overlay through a
 * `useSyncExternalStore` subscription — it's the same data, just exposed
 * as a plain JS snapshot for React.
 */

import {
  InstancePresenceRecordType,
  type Editor,
  type TLInstancePresenceID,
  type TLPageId,
  type TLShapeId,
} from "tldraw";

const PRESENCE_TTL_MS = 60_000;
const PRESENCE_GC_INTERVAL_MS = 5_000;
const FOLLOW_PADDING = 96;
const DEFAULT_COLOR = "#a855f7";

export interface CanvasAgentPresence {
  actor_id: string;
  name: string;
  color: string;
  last_command: string;
  last_seen_at: number;
  /** Last bounds the agent operated on (page-space). */
  last_bounds?: { x: number; y: number; w: number; h: number };
  /** Last camera the agent set, if it modified the viewport. */
  last_camera?: { x: number; y: number; z: number };
  /** Shape ids the agent most recently created / modified. */
  last_shape_ids: string[];
  /** tldraw user id used with `editor.startFollowingUser(userId)`. */
  user_id: string;
}

export function agentUserIdFor(actorId: string): string {
  return `agent:${actorId}`;
}

export class CanvasAgentPresenceStore {
  private agents = new Map<string, CanvasAgentPresence>();
  private listeners = new Set<() => void>();
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private editor: Editor | null = null;

  start() {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => this.evictStale(), PRESENCE_GC_INTERVAL_MS);
  }

  stop() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  /**
   * Bind the live editor. Called by the bridge hook whenever the tldraw
   * `Editor` mounts or unmounts. When the editor is detached we drop any
   * presence records we've written so the user never follows a ghost.
   */
  setEditor(editor: Editor | null) {
    if (this.editor === editor) return;
    if (this.editor) {
      this.removeAllPresenceRecords(this.editor);
      // Also stop any active follow so the user isn't stuck if we re-bind
      // a different editor later.
      try {
        if (this.editor.getInstanceState().followingUserId) {
          this.editor.stopFollowingUser();
        }
      } catch {
        // Editor may have been disposed; safe to ignore.
      }
    }
    this.editor = editor;
    if (editor) {
      // Re-emit so any subscribers re-render with the new editor context.
      for (const presence of this.agents.values()) {
        this.writePresenceRecord(editor, presence);
      }
    }
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): readonly CanvasAgentPresence[] => {
    return Array.from(this.agents.values()).sort(
      (a, b) => b.last_seen_at - a.last_seen_at,
    );
  };

  getFollowedActor = (): string | null => {
    if (!this.editor) return null;
    const userId = this.editor.getInstanceState().followingUserId;
    if (!userId || !userId.startsWith("agent:")) return null;
    return userId.slice("agent:".length);
  };

  /**
   * Follow the agent's virtual presence. Maps directly to
   * `editor.startFollowingUser` per the tldraw User Following docs.
   * Passing `null` cancels following (equivalent to `stopFollowingUser`).
   */
  setFollowedActor(actorId: string | null) {
    const editor = this.editor;
    if (!editor) return;
    try {
      if (actorId === null) {
        if (editor.getInstanceState().followingUserId) {
          editor.stopFollowingUser();
        }
      } else if (this.agents.has(actorId)) {
        editor.startFollowingUser(agentUserIdFor(actorId));
      }
    } catch (err) {
      console.debug("[canvas-agent] follow toggle failed", err);
    }
    this.emit();
  }

  /**
   * One-shot "jump to agent" — uses `editor.zoomToUser` so the user lands
   * on the agent's cursor without entering follow mode.
   */
  jumpToActor(actorId: string) {
    const editor = this.editor;
    if (!editor) return;
    if (!this.agents.has(actorId)) return;
    try {
      editor.zoomToUser(agentUserIdFor(actorId));
    } catch (err) {
      console.debug("[canvas-agent] zoomToUser failed", err);
    }
  }

  /**
   * Called by the bus right before a command runs. Records intent and
   * pings the timestamp so the agent stays "live" for at least the TTL
   * window.
   */
  touch(
    actor: { actor_id: string; name?: string | null; color?: string | null },
    command: string,
  ) {
    const existing = this.agents.get(actor.actor_id);
    const next: CanvasAgentPresence = {
      actor_id: actor.actor_id,
      user_id: agentUserIdFor(actor.actor_id),
      name: actor.name ?? existing?.name ?? "Terminal Agent",
      color: actor.color ?? existing?.color ?? DEFAULT_COLOR,
      last_command: command,
      last_seen_at: Date.now(),
      last_bounds: existing?.last_bounds,
      last_camera: existing?.last_camera,
      last_shape_ids: existing?.last_shape_ids ?? [],
    };
    this.agents.set(actor.actor_id, next);
    if (this.editor) {
      this.writePresenceRecord(this.editor, next);
    }
    this.emit();
  }

  recordResult(actorId: string, editor: Editor, shapeIds: string[]) {
    const existing = this.agents.get(actorId);
    if (!existing) return;
    const camera = editor.getCamera();
    let bounds: CanvasAgentPresence["last_bounds"];
    if (shapeIds.length > 0) {
      const tlIds = shapeIds.filter((id) => editor.getShape(id as TLShapeId));
      if (tlIds.length) {
        const first = editor.getShapePageBounds(tlIds[0] as TLShapeId);
        if (first) {
          let minX = first.minX;
          let minY = first.minY;
          let maxX = first.maxX;
          let maxY = first.maxY;
          for (const id of tlIds.slice(1)) {
            const b = editor.getShapePageBounds(id as TLShapeId);
            if (!b) continue;
            minX = Math.min(minX, b.minX);
            minY = Math.min(minY, b.minY);
            maxX = Math.max(maxX, b.maxX);
            maxY = Math.max(maxY, b.maxY);
          }
          bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
      }
    }
    const next: CanvasAgentPresence = {
      ...existing,
      last_seen_at: Date.now(),
      last_bounds: bounds ?? existing.last_bounds,
      last_camera: { x: camera.x, y: camera.y, z: camera.z },
      last_shape_ids: shapeIds.length ? shapeIds : existing.last_shape_ids,
    };
    this.agents.set(actorId, next);
    this.writePresenceRecord(editor, next);
    this.emit();
  }

  clear() {
    if (this.editor) {
      this.removeAllPresenceRecords(this.editor);
    }
    this.agents.clear();
    this.emit();
  }

  evictStale() {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    let mutated = false;
    for (const [id, agent] of Array.from(this.agents.entries())) {
      if (agent.last_seen_at < cutoff) {
        this.agents.delete(id);
        if (this.editor) {
          this.removePresenceRecord(this.editor, id);
        }
        mutated = true;
      }
    }
    if (mutated) this.emit();
  }

  // ===== TLInstancePresence I/O ============================================

  private presenceIdFor(actorId: string): TLInstancePresenceID {
    return InstancePresenceRecordType.createId(agentUserIdFor(actorId));
  }

  /**
   * Write or update a `TLInstancePresence` record for the given agent in
   * `editor.store`. The synthesised `camera` + `screenBounds` make
   * `editor.startFollowingUser(userId)` and `editor.zoomToUser(userId)`
   * land on the agent's last activity.
   */
  private writePresenceRecord(editor: Editor, presence: CanvasAgentPresence) {
    try {
      const pageId = editor.getCurrentPageId() as TLPageId;
      const { camera, screenBounds, cursorPoint } = computeFollowCamera(
        editor,
        presence,
      );
      const record = InstancePresenceRecordType.create({
        id: this.presenceIdFor(presence.actor_id),
        userId: presence.user_id,
        userName: presence.name,
        color: presence.color,
        currentPageId: pageId,
        camera,
        screenBounds,
        cursor: {
          x: cursorPoint.x,
          y: cursorPoint.y,
          type: "default",
          rotation: 0,
        },
        selectedShapeIds: filterValidShapeIds(editor, presence.last_shape_ids),
        lastActivityTimestamp: presence.last_seen_at,
        followingUserId: null,
        chatMessage: presence.last_command,
        brush: null,
        scribbles: [],
        meta: {
          kind: "atmos-terminal-agent",
          actor_id: presence.actor_id,
          last_command: presence.last_command,
        },
      });
      editor.store.put([record]);
    } catch (err) {
      console.debug("[canvas-agent] writePresenceRecord failed", err);
    }
  }

  private removePresenceRecord(editor: Editor, actorId: string) {
    try {
      editor.store.remove([this.presenceIdFor(actorId)]);
    } catch (err) {
      console.debug("[canvas-agent] removePresenceRecord failed", err);
    }
  }

  private removeAllPresenceRecords(editor: Editor) {
    const ids = Array.from(this.agents.keys()).map((actorId) =>
      this.presenceIdFor(actorId),
    );
    if (!ids.length) return;
    try {
      editor.store.remove(ids);
    } catch (err) {
      console.debug("[canvas-agent] removeAllPresenceRecords failed", err);
    }
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Build a synthetic `(camera, screenBounds, cursor)` tuple for the agent so
 * tldraw's `getViewportPageBoundsForFollowing` frames the agent's last
 * activity bounds for the follower.
 *
 * Math: tldraw treats the leader's world viewport as
 *   `Box(-camera.x, -camera.y, screenBounds.w / camera.z, screenBounds.h / camera.z)`.
 * Setting `camera.z = 1` and `screenBounds.{w,h}` = the padded bounds size
 * means the leader's viewport IS exactly the padded bounds, which is what
 * we want for "show me where the agent just worked."
 */
function computeFollowCamera(
  editor: Editor,
  presence: CanvasAgentPresence,
): {
  camera: { x: number; y: number; z: number };
  screenBounds: { x: number; y: number; w: number; h: number };
  cursorPoint: { x: number; y: number };
} {
  if (presence.last_bounds && presence.last_bounds.w > 0 && presence.last_bounds.h > 0) {
    const b = presence.last_bounds;
    const w = b.w + FOLLOW_PADDING * 2;
    const h = b.h + FOLLOW_PADDING * 2;
    const camera = { x: -(b.x - FOLLOW_PADDING), y: -(b.y - FOLLOW_PADDING), z: 1 };
    return {
      camera,
      screenBounds: { x: 0, y: 0, w, h },
      cursorPoint: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
    };
  }
  // Fallback when the agent hasn't produced bounds yet: mirror the human
  // user's current viewport so the agent appears "in view" with cursor at
  // the viewport center.
  const cam = editor.getCamera();
  let viewportW = 800;
  let viewportH = 600;
  try {
    const screen = editor.getViewportScreenBounds();
    viewportW = screen.w;
    viewportH = screen.h;
  } catch {
    // Some test editors don't implement viewport bounds; the defaults are
    // sufficient for tldraw's math to remain non-degenerate.
  }
  const viewportPage = (() => {
    try {
      return editor.getViewportPageBounds();
    } catch {
      return null;
    }
  })();
  const center = viewportPage?.center ?? { x: 0, y: 0 };
  return {
    camera: { x: cam.x, y: cam.y, z: cam.z },
    screenBounds: { x: 0, y: 0, w: viewportW, h: viewportH },
    cursorPoint: { x: center.x, y: center.y },
  };
}

function filterValidShapeIds(editor: Editor, ids: string[]): TLShapeId[] {
  return ids
    .filter((id) => {
      try {
        return Boolean(editor.getShape(id as TLShapeId));
      } catch {
        return false;
      }
    })
    .map((id) => id as TLShapeId);
}
