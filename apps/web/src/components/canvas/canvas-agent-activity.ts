"use client";

/**
 * Canvas agent activity — single-slot record of the most recent successful
 * `atmos canvas <verb>` dispatch.
 *
 * Why so small: we intentionally do NOT model "who is connected" or
 * "which agents are online". From the user's perspective every CLI dispatch
 * is anonymous — they already know which terminal/agent they invoked it
 * from. The UI only needs two affordances:
 *
 *   1. "An agent is currently driving the canvas"      → `lastSeenAt` recent
 *   2. "Jump my viewport to whatever the agent just changed" → `bounds` / `shapeIds`
 *
 * Everything else (per-actor presence, follow/zoomToUser, TLInstancePresence
 * records, online agent lists) was removed deliberately — see git history
 * for the previous multi-agent implementation if multi-user collaboration
 * is ever revived.
 */

import type { Editor, TLShapeId } from "tldraw";

export interface CanvasAgentActivity {
  /** The dispatched command verb, e.g. `create-note`. */
  command: string;
  /** Shape ids most recently created or modified by the agent. */
  shapeIds: string[];
  /** Union of page-space bounds of `shapeIds`, when computable. */
  bounds: { x: number; y: number; w: number; h: number } | null;
  /** `Date.now()` at the moment the dispatch completed. */
  at: number;
}

export class CanvasAgentActivityStore {
  private last: CanvasAgentActivity | null = null;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CanvasAgentActivity | null => this.last;

  /**
   * Record a successful dispatch. `shapeIds` may be empty (read-only verbs
   * like `status` / `get_state`). `editor` is only used to compute bounds;
   * pass `null` if the editor is not mounted.
   */
  record(command: string, editor: Editor | null, shapeIds: string[]) {
    this.last = {
      command,
      shapeIds: [...shapeIds],
      bounds: editor && shapeIds.length ? unionShapePageBounds(editor, shapeIds) : null,
      at: Date.now(),
    };
    this.emit();
  }

  clear() {
    if (this.last === null) return;
    this.last = null;
    this.emit();
  }

  /**
   * Pan/zoom the editor so the latest agent activity is in view. No-op when
   * we have no bounds (the most recent verb was read-only) or the shapes
   * have since been deleted by the user.
   */
  jumpToLast(editor: Editor) {
    const last = this.last;
    if (!last) return;
    const bounds =
      last.shapeIds.length > 0 ? unionShapePageBounds(editor, last.shapeIds) : last.bounds;
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) return;
    try {
      editor.zoomToBounds(
        { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
        { animation: { duration: 200 } },
      );
    } catch {
      // Editor may have been disposed; safe to ignore.
    }
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

function unionShapePageBounds(
  editor: Editor,
  ids: readonly string[],
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const id of ids) {
    let b: ReturnType<Editor["getShapePageBounds"]> | null = null;
    try {
      b = editor.getShapePageBounds(id as TLShapeId) ?? null;
    } catch {
      b = null;
    }
    if (!b) continue;
    any = true;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!any) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
