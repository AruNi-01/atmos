/**
 * Helpers bag exposed to document scripts (aligned with tldraw offline recipes).
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
};

export function createDocumentScriptHelpers(editor: Editor): DocumentScriptHelpers {
  const richTextToPlainText = (richText: unknown): string => {
    if (richText == null) return "";
    if (typeof richText === "string") return richText;
    try {
      // TipTap-like doc
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
            editor.updateShape({
              id,
              type: shape.type,
              x: shape.x + dx,
              y: shape.y + dy,
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
  };
}
