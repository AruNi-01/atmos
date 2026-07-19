/**
 * Helpers bag exposed to document scripts.
 *
 * Input scoping: games/interactive boards should call `claimInputScope` so
 * arrow keys / space are not stolen by tldraw selection nudging, and only the
 * focused surface receives keyboard while active.
 *
 * Why bare window keydown fails: SelectTool nudges on Arrow* only after the
 * editor container's keydown handler (useDocumentEvents) dispatches key_down.
 * Capture-phase listeners on window + stopPropagation run first, so the
 * container never sees game keys. Bubble-only listeners + preventDefault alone
 * are too late — both the game and the nudge run.
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
  /** Release keyboard claim. */
  release: () => void;
};

export type ClaimInputScopeOptions = {
  /**
   * Surface anchor (usually a frame / board rect). Click outside its bounds
   * (or Escape) releases the scope so other canvas tools work again.
   */
  surfaceId?: TLShapeId;
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
      const blocks: string[] = [];
      for (const block of root.content ?? []) {
        const parts: string[] = [];
        for (const span of block.content ?? []) {
          if (span.text) parts.push(span.text);
        }
        const line = parts.join("");
        if (line.length) blocks.push(line);
      }
      return blocks.join("\n");
    } catch {
      return "";
    }
  };

  const isAtmosChromeShape = (shape: TLShape | null | undefined) => {
    if (!shape) return false;
    return shape.type === "canvas-terminal" || shape.type === "canvas-widget";
  };

  const shouldIgnoreKeyboardTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return Boolean(
      el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable ||
        el.closest?.("[data-canvas-terminal], .xterm"),
    );
  };

  const pointInSurface = (surfaceId: TLShapeId | undefined, pagePoint: { x: number; y: number }) => {
    if (!surfaceId) return true;
    const box = getShapePageBoundsBox(editor, surfaceId);
    if (!box) return false;
    return (
      pagePoint.x >= box.minX &&
      pagePoint.x <= box.minX + box.width &&
      pagePoint.y >= box.minY &&
      pagePoint.y <= box.minY + box.height
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
      const last = editor.getShape(shapeId);
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
      const x1 = fromBox.minX + fromBox.width / 2;
      const y1 = fromBox.minY + fromBox.height / 2;
      const x2 = toBox.minX + toBox.width / 2;
      const y2 = toBox.minY + toBox.height / 2;
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

      let active = true;
      // SelectTool nudges selected shapes on Arrow* via editor.dispatch(key_down).
      // Window capture + stopPropagation runs before the editor container sees the
      // event (useDocumentEvents listens on container, not window). A dispatch
      // guard covers any remaining leaks without changing selection, locks, or tools.
      const originalDispatch = editor.dispatch.bind(editor);

      const isCapturedKey = (e: { code?: string; key?: string }) =>
        Boolean(
          (e.code && captureKeys.has(e.code)) ||
            (e.key && captureKeys.has(e.key)),
        );

      /** Block keys from reaching SelectTool nudge / other editor keyboard tools. */
      const suppressEditorKeyEvent = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        try {
          // Official tldraw API: skip useDocumentEvents → editor.dispatch(key_down).
          editor.markEventAsHandled(e);
        } catch {
          // ignore
        }
      };

      // Drop key_down / key_repeat that still reach the editor (e.g. synthetic dispatch).
      editor.dispatch = ((info: unknown, ...rest: unknown[]) => {
        if (
          active &&
          info &&
          typeof info === "object" &&
          (info as { type?: string }).type === "keyboard"
        ) {
          const k = info as { name?: string; code?: string; key?: string };
          if (
            (k.name === "key_down" || k.name === "key_repeat") &&
            isCapturedKey(k)
          ) {
            return editor;
          }
        }
        return (originalDispatch as (...args: unknown[]) => unknown)(info, ...rest);
      }) as typeof editor.dispatch;

      const onKeyDown = (e: KeyboardEvent) => {
        if (!active) return;
        // Don't steal keys from real form fields / terminals.
        if (shouldIgnoreKeyboardTarget(e.target)) {
          return;
        }

        if (e.code === "Escape" && releaseOnEscape) {
          suppressEditorKeyEvent(e);
          release();
          return;
        }

        if (!isCapturedKey(e)) {
          return;
        }

        suppressEditorKeyEvent(e);
        options.onKeyDown?.(e);
      };

      const onKeyUp = (e: KeyboardEvent) => {
        if (!active) return;
        if (shouldIgnoreKeyboardTarget(e.target)) {
          return;
        }
        if (!isCapturedKey(e)) return;
        suppressEditorKeyEvent(e);
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

      // Capture phase on window — runs before the editor container keydown
      // (useDocumentEvents: container.addEventListener('keydown', ...)).
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
        // Restore dispatch
        try {
          editor.dispatch = originalDispatch;
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
