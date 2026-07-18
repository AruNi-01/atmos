/**
 * Helpers bag exposed to document scripts (aligned with tldraw offline recipes).
 *
 * Input scoping: games/interactive boards should call `claimInputScope` so
 * arrow keys / space are not stolen by tldraw selection nudging, and only the
 * focused surface receives keyboard while active.
 */
import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from "tldraw";

import { createArrowShapeWithBindings } from "./canvas-agent-arrow-bindings";
import { getShapePageBoundsBox } from "./canvas-agent-bounds";
import { computeCanvasLints, type CanvasAgentLint } from "./canvas-agent-lint";

export type DocumentScriptInputScope = {
  /** Whether this scope currently owns keyboard/pointer game input. */
  isActive: () => boolean;
  /** Release keyboard claim, unlock shapes, restore tool. */
  release: () => void;
};

export type ClaimInputScopeOptions = {
  /**
   * Surface anchor (usually a frame / board rect). Click outside its bounds
   * (or Escape) releases the scope so other canvas tools work again.
   */
  surfaceId?: TLShapeId;
  /**
   * Shapes to lock while scoped (Start button, walls, etc.) so arrow keys
   * cannot select/nudge them. Defaults to [surfaceId] when surfaceId is set.
   */
  lockShapeIds?: TLShapeId[];
  /**
   * Key codes to preventDefault + deliver when scoped.
   * Default: arrows, WASD, Space, Enter, Escape (Escape also releases).
   */
  captureKeys?: string[];
  onKeyDown?: (e: KeyboardEvent) => void;
  onKeyUp?: (e: KeyboardEvent) => void;
  /** When true (default), Escape releases the scope. */
  releaseOnEscape?: boolean;
  /** When true (default), pointer-down outside surface bounds releases. */
  releaseOnOutsidePointer?: boolean;
  signal?: AbortSignal;
};

export type DocumentScriptHelpers = {
  createShapeId: typeof createShapeId;
  toRichText: typeof toRichText;
  richTextToPlainText: (richText: unknown) => string;
  createShapeIfMissing: (
    partial: TLShapePartial & { id: TLShapeId },
  ) => { id: TLShapeId; created: boolean };
  createShapesIfMissing: (
    partials: Array<TLShapePartial & { id: TLShapeId }>,
  ) => { created: TLShapeId[]; existing: TLShapeId[] };
  translateShapes: (ids: TLShapeId[], dx: number, dy: number) => void;
  onShapeTranslate: (
    shapeId: TLShapeId,
    cb: (delta: { dx: number; dy: number }) => void,
    options?: { signal?: AbortSignal },
  ) => () => void;
  createArrowBetweenShapes: (
    fromId: TLShapeId,
    toId: TLShapeId,
    options?: { text?: string; color?: string },
  ) => TLShapeId;
  getLints: () => { lints: CanvasAgentLint[] };
  isAtmosChromeShape: (shape: TLShape | null | undefined) => boolean;
  /**
   * Claim keyboard/game input for an interactive surface (snake board, etc.).
   * Call when the user clicks Start / the board. Only one scope is active per editor.
   */
  claimInputScope: (options?: ClaimInputScopeOptions) => DocumentScriptInputScope;
  /** Whether any input scope is currently active on this editor. */
  hasActiveInputScope: () => boolean;
};

const DEFAULT_CAPTURE_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "Enter",
  "Escape",
];

/** One active scope per editor instance. */
const activeScopeByEditor = new WeakMap<Editor, { release: () => void }>();

export function createDocumentScriptHelpers(editor: Editor): DocumentScriptHelpers {
  const richTextToPlainText = (richText: unknown): string => {
    if (richText == null) return "";
    if (typeof richText === "string") return richText;
    try {
      const root = richText as { content?: Array<{ content?: Array<{ text?: string }> }> };
      const parts: string[] = [];
      for (const block of root.content ?? []) {
        for (const span of block.content ?? []) {
          if (span.text) parts.push(span.text);
        }
      }
      return parts.join("");
    } catch {
      return "";
    }
  };

  const isAtmosChromeShape = (shape: TLShape | null | undefined) => {
    if (!shape) return false;
    return shape.type === "canvas-terminal" || shape.type === "canvas-widget";
  };

  const setShapesLocked = (ids: TLShapeId[], locked: boolean) => {
    editor.run(
      () => {
        for (const id of ids) {
          const shape = editor.getShape(id);
          if (!shape || isAtmosChromeShape(shape)) continue;
          if (Boolean(shape.isLocked) === locked) continue;
          editor.updateShape({
            id,
            type: shape.type,
            isLocked: locked,
          });
        }
      },
      { history: "ignore" },
    );
  };

  const pointInSurface = (surfaceId: TLShapeId | undefined, pagePoint: { x: number; y: number }) => {
    if (!surfaceId) return true;
    const box = getShapePageBoundsBox(editor, surfaceId);
    if (!box) return false;
    return (
      pagePoint.x >= box.minX &&
      pagePoint.x <= box.minX + box.w &&
      pagePoint.y >= box.minY &&
      pagePoint.y <= box.minY + box.h
    );
  };

  return {
    createShapeId,
    toRichText,
    richTextToPlainText,
    createShapeIfMissing(partial) {
      const existing = editor.getShape(partial.id);
      if (existing) {
        return { id: partial.id, created: false };
      }
      editor.run(
        () => {
          editor.createShape(partial);
        },
        { history: "ignore" },
      );
      return { id: partial.id, created: true };
    },
    createShapesIfMissing(partials) {
      const created: TLShapeId[] = [];
      const existing: TLShapeId[] = [];
      editor.run(
        () => {
          for (const partial of partials) {
            if (editor.getShape(partial.id)) {
              existing.push(partial.id);
            } else {
              editor.createShape(partial);
              created.push(partial.id);
            }
          }
        },
        { history: "ignore" },
      );
      return { created, existing };
    },
    translateShapes(ids, dx, dy) {
      if (dx === 0 && dy === 0) return;
      editor.run(
        () => {
          for (const id of ids) {
            const shape = editor.getShape(id);
            if (!shape || isAtmosChromeShape(shape)) continue;
            // Temporarily unlock for script-driven motion if needed
            const wasLocked = shape.isLocked;
            if (wasLocked) {
              editor.updateShape({ id, type: shape.type, isLocked: false });
            }
            editor.updateShape({
              id,
              type: shape.type,
              x: shape.x + dx,
              y: shape.y + dy,
              isLocked: wasLocked,
            });
          }
        },
        { history: "ignore" },
      );
    },
    onShapeTranslate(shapeId, cb, options) {
      let last = editor.getShape(shapeId);
      let lastX = last?.x ?? 0;
      let lastY = last?.y ?? 0;
      const unsub = editor.store.listen(
        () => {
          const shape = editor.getShape(shapeId);
          if (!shape) return;
          const dx = shape.x - lastX;
          const dy = shape.y - lastY;
          if (dx === 0 && dy === 0) return;
          lastX = shape.x;
          lastY = shape.y;
          cb({ dx, dy });
        },
        { source: "user", scope: "document" },
      );
      const onAbort = () => unsub();
      options?.signal?.addEventListener("abort", onAbort, { once: true });
      return () => {
        options?.signal?.removeEventListener("abort", onAbort);
        unsub();
      };
    },
    createArrowBetweenShapes(fromId, toId, options) {
      const fromBox = getShapePageBoundsBox(editor, fromId);
      const toBox = getShapePageBoundsBox(editor, toId);
      if (!fromBox || !toBox) {
        throw new Error("createArrowBetweenShapes: missing shape bounds");
      }
      const x1 = fromBox.minX + fromBox.w / 2;
      const y1 = fromBox.minY + fromBox.h / 2;
      const x2 = toBox.minX + toBox.w / 2;
      const y2 = toBox.minY + toBox.h / 2;
      return createArrowShapeWithBindings(editor, {
        x1,
        y1,
        x2,
        y2,
        fromId,
        toId,
        props: {
          ...(options?.text ? { richText: toRichText(options.text) } : {}),
          ...(options?.color ? { color: options.color } : {}),
        },
      });
    },
    getLints() {
      return { lints: computeCanvasLints(editor) };
    },
    isAtmosChromeShape,
    hasActiveInputScope() {
      return activeScopeByEditor.has(editor);
    },
    claimInputScope(options = {}) {
      // One scope at a time — release previous (e.g. another game on the board).
      activeScopeByEditor.get(editor)?.release();

      const captureKeys = new Set(options.captureKeys ?? DEFAULT_CAPTURE_KEYS);
      const releaseOnEscape = options.releaseOnEscape !== false;
      const releaseOnOutsidePointer = options.releaseOnOutsidePointer !== false;
      const lockIds =
        options.lockShapeIds ??
        (options.surfaceId ? [options.surfaceId] : []);

      let active = true;
      const previousTool = editor.getCurrentToolId();

      // Enter "play mode": no selection, hand tool so arrows aren't select-nudge.
      editor.setSelectedShapes([]);
      try {
        editor.setCurrentTool("hand");
      } catch {
        // tool may be unavailable; continue
      }
      if (lockIds.length) {
        setShapesLocked(lockIds, true);
      }

      const onKeyDown = (e: KeyboardEvent) => {
        if (!active) return;
        // Don't steal keys from real form fields / terminals.
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable ||
            target.closest?.("[data-canvas-terminal], .xterm"))
        ) {
          return;
        }

        if (e.code === "Escape" && releaseOnEscape) {
          e.preventDefault();
          e.stopPropagation();
          release();
          return;
        }

        if (!captureKeys.has(e.code) && !captureKeys.has(e.key)) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        options.onKeyDown?.(e);
      };

      const onKeyUp = (e: KeyboardEvent) => {
        if (!active) return;
        if (!captureKeys.has(e.code) && !captureKeys.has(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        options.onKeyUp?.(e);
      };

      const onPointerDown = (info: { name?: string; point?: { x: number; y: number } }) => {
        if (!active || !releaseOnOutsidePointer || !options.surfaceId) return;
        if (info?.name !== "pointer_down") return;
        const point = info.point
          ? editor.screenToPage(info.point)
          : editor.inputs.currentPagePoint;
        if (!point) return;
        if (!pointInSurface(options.surfaceId, point)) {
          release();
        }
      };

      // Capture phase so we run before tldraw's nudge handlers.
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("keyup", onKeyUp, true);
      editor.on("event", onPointerDown);

      const release = () => {
        if (!active) return;
        active = false;
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("keyup", onKeyUp, true);
        try {
          editor.off("event", onPointerDown);
        } catch {
          // ignore
        }
        if (lockIds.length) {
          setShapesLocked(lockIds, false);
        }
        try {
          editor.setCurrentTool(previousTool || "select");
        } catch {
          // ignore
        }
        if (activeScopeByEditor.get(editor)?.release === release) {
          activeScopeByEditor.delete(editor);
        }
      };

      activeScopeByEditor.set(editor, { release });

      options.signal?.addEventListener("abort", release, { once: true });

      return {
        isActive: () => active,
        release,
      };
    },
  };
}
