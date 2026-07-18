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

import {
  AGENT_VIEW_PADDING,
  boundsFromBox,
  type CanvasAgentBounds,
  unionBounds,
} from "./canvas-agent-view-bounds";

export type CanvasAgentSessionStatus = "active" | "idle";

export interface CanvasAgentViewState {
  /** Dashed "agent view" frame in page space (union of viewport + touched shapes). */
  viewBounds: CanvasAgentBounds | null;
  /** True while a `canvas_agent_dispatch` is in flight. */
  inflight: boolean;
  /**
   * Explicit session from `set-status`. `null` means infer from recent
   * dispatch timestamps (fallback when the agent omits `set-status`).
   */
  session: CanvasAgentSessionStatus | null;
}

const EMPTY_VIEW_STATE: CanvasAgentViewState = {
  viewBounds: null,
  inflight: false,
  session: null,
};

/** Whether the top-right bridge control should show the active (green) state. */
export function resolveCanvasAgentIndicatorActive(
  viewState: CanvasAgentViewState,
  recentlyActive: boolean,
): boolean {
  if (viewState.session === "idle") return false;
  if (viewState.session === "active" || viewState.inflight) return true;
  return recentlyActive;
}

/** Whether the bottom-right island should show the working animation. */
export function resolveCanvasAgentIslandWorking(
  viewState: CanvasAgentViewState,
  recentlyActive: boolean,
  feedEntryActive: boolean,
): boolean {
  if (viewState.session === "idle") return false;
  if (viewState.session === "active") return true;
  return viewState.inflight || feedEntryActive || recentlyActive;
}

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
  private viewBounds: CanvasAgentBounds | null = null;
  private inflightDepth = 0;
  private inflight = false;
  /** Set by `set-status`; cleared when a new dispatch begins. */
  private session: CanvasAgentSessionStatus | null = null;
  private listeners = new Set<() => void>();
  /** Stable reference between mutations — required by `useSyncExternalStore`. */
  private cachedViewState: CanvasAgentViewState = EMPTY_VIEW_STATE;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CanvasAgentActivity | null => this.last;

  getViewState = (): CanvasAgentViewState => this.cachedViewState;

  /**
   * Session signal from `atmos canvas set-status`. `idle` stops UI indicators
   * immediately; `active` keeps them on until the next `idle` or dispatch.
   */
  setStatus(status: CanvasAgentSessionStatus) {
    this.session = status;
    if (status === "idle") {
      this.inflightDepth = 0;
      this.inflight = false;
    } else if (this.last) {
      this.last = { ...this.last, at: Date.now() };
    } else {
      this.last = {
        command: "set-status",
        shapeIds: [],
        bounds: null,
        at: Date.now(),
      };
    }
    this.emit();
  }

  /** Called when a dispatch starts — seed view from current viewport. */
  beginWork(editor: Editor | null, command?: string) {
    this.session = null;
    this.inflightDepth += 1;
    this.inflight = true;
    const normalized = command?.trim().toLowerCase().replace(/_/g, "-");
    if (editor && normalized !== "set-agent-view") {
      try {
        const vp = editor.getViewportPageBounds();
        this.viewBounds = unionBounds(this.viewBounds, boundsFromBox(vp), AGENT_VIEW_PADDING);
      } catch {
        // Editor may be disposing.
      }
    }
    this.emit();
  }

  endWork() {
    if (this.inflightDepth <= 0) return;
    this.inflightDepth -= 1;
    this.inflight = this.inflightDepth > 0;
    this.emit();
  }

  /**
   * Set the dashed agent-view frame explicitly (`set-agent-view` command).
   * When `replace` is true, previous inferred bounds are discarded.
   */
  setAgentView(bounds: CanvasAgentBounds, replace = true) {
    this.viewBounds = replace
      ? bounds
      : unionBounds(this.viewBounds, bounds, 0);
    this.emit();
  }

  /** After `viewport` or explicit camera moves, align the frame to what the user sees. */
  syncViewToViewport(editor: Editor) {
    try {
      const vp = editor.getViewportPageBounds();
      this.viewBounds = unionBounds(this.viewBounds, boundsFromBox(vp), AGENT_VIEW_PADDING);
      this.emit();
    } catch {
      // ignore
    }
  }

  private expandView(editor: Editor | null, shapeIds: string[]) {
    if (!editor) return;
    const shapeBounds = shapeIds.length ? unionShapePageBounds(editor, shapeIds) : null;
    if (shapeBounds) {
      this.viewBounds = unionBounds(this.viewBounds, shapeBounds, AGENT_VIEW_PADDING);
    }
  }

  /**
   * Record a successful dispatch. `shapeIds` may be empty (read-only verbs
   * like `status` / `get_state`). `editor` is only used to compute bounds;
   * pass `null` if the editor is not mounted.
   */
  record(command: string, editor: Editor | null, shapeIds: string[]) {
    this.expandView(editor, shapeIds);
    const normalized = command.trim().toLowerCase().replace(/_/g, "-");
    if (normalized === "viewport" && editor) {
      this.syncViewToViewport(editor);
    }
    this.last = {
      command,
      shapeIds: [...shapeIds],
      bounds: editor && shapeIds.length ? unionShapePageBounds(editor, shapeIds) : null,
      at: Date.now(),
    };
    this.emit();
  }

  clear() {
    let changed = false;
    if (this.last !== null) {
      this.last = null;
      changed = true;
    }
    if (this.viewBounds !== null) {
      this.viewBounds = null;
      changed = true;
    }
    if (this.inflightDepth > 0 || this.inflight) {
      this.inflightDepth = 0;
      this.inflight = false;
      changed = true;
    }
    if (this.session !== null) {
      this.session = null;
      changed = true;
    }
    if (changed) this.emit();
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

  private rebuildViewSnapshot() {
    const bounds = this.viewBounds;
    this.cachedViewState = {
      viewBounds: bounds ? { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } : null,
      inflight: this.inflight,
      session: this.session,
    };
  }

  private emit() {
    this.rebuildViewSnapshot();
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
