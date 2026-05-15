"use client";

/**
 * APP-015 Canvas Agent Presence — lightweight registry of "virtual" terminal
 * agents that are currently driving the Canvas. M20 calls for tldraw-style
 * presence records; we keep it intentionally simple here:
 *
 *  - Each agent is keyed by `actor_id` (CLI-supplied).
 *  - We track their last command, the page-space bounds they touched, and
 *    a `lastSeen` timestamp.
 *  - The UI subscribes via `useSyncExternalStore` so the CanvasView can
 *    render an HTML overlay (Agent badge + Follow Agent dock).
 */

import type { Editor, TLShapeId } from "tldraw";

const PRESENCE_TTL_MS = 30_000;

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
}

export class CanvasAgentPresenceStore {
  private agents = new Map<string, CanvasAgentPresence>();
  private listeners = new Set<() => void>();
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private followedActorId: string | null = null;

  start() {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => this.evictStale(), 5_000);
  }

  stop() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
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

  getFollowedActor = (): string | null => this.followedActorId;

  setFollowedActor(actorId: string | null) {
    if (this.followedActorId === actorId) return;
    this.followedActorId = actorId;
    this.emit();
  }

  /**
   * Called by the bus right before a command runs. Records intent and pings
   * the timestamp so the agent stays "live" for at least the TTL window.
   */
  touch(actor: { actor_id: string; name?: string | null; color?: string | null }, command: string) {
    const existing = this.agents.get(actor.actor_id);
    const next: CanvasAgentPresence = {
      actor_id: actor.actor_id,
      name: actor.name ?? existing?.name ?? "Terminal Agent",
      color: actor.color ?? existing?.color ?? "#a855f7",
      last_command: command,
      last_seen_at: Date.now(),
      last_bounds: existing?.last_bounds,
      last_camera: existing?.last_camera,
      last_shape_ids: existing?.last_shape_ids ?? [],
    };
    this.agents.set(actor.actor_id, next);
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
        const aggregate = editor.getShapePageBounds(tlIds[0] as TLShapeId);
        if (aggregate) {
          let minX = aggregate.minX;
          let minY = aggregate.minY;
          let maxX = aggregate.maxX;
          let maxY = aggregate.maxY;
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
    this.agents.set(actorId, {
      ...existing,
      last_seen_at: Date.now(),
      last_bounds: bounds ?? existing.last_bounds,
      last_camera: { x: camera.x, y: camera.y, z: camera.z },
      last_shape_ids: shapeIds.length ? shapeIds : existing.last_shape_ids,
    });
    this.emit();
  }

  clear() {
    this.agents.clear();
    this.followedActorId = null;
    this.emit();
  }

  private evictStale() {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    let mutated = false;
    for (const [id, agent] of Array.from(this.agents.entries())) {
      if (agent.last_seen_at < cutoff) {
        this.agents.delete(id);
        if (this.followedActorId === id) {
          this.followedActorId = null;
        }
        mutated = true;
      }
    }
    if (mutated) this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
