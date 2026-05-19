import { toRichText, type Editor, type TLShape, type TLShapePartial } from "tldraw";

import { CanvasAgentError } from "./canvas-agent-errors";

/** tldraw v5 note sticky default width (page units); maps CLI `--w` → `scale`. */
export const NOTE_BASE_WIDTH = 200;

const UPDATE_SHAPE_ALLOWED_KEYS = new Set([
  "color",
  "fill",
  "text",
  "size",
  "font",
  "geo",
  "w",
  "h",
  "x",
  "y",
]);

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.length) {
    throw new CanvasAgentError("VALIDATION_ARG", `${label} must be a non-empty string`, false);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new CanvasAgentError("VALIDATION_ARG", `${label} must be a finite number`, false);
  }
  return n;
}

/**
 * Turn agent `update-shape --patch` into a tldraw-safe partial (shape-type aware).
 */
export function planUpdateShapePartial(
  shape: TLShape,
  rawPatch: Record<string, unknown>,
): TLShapePartial {
  const partial: TLShapePartial = { id: shape.id, type: shape.type };
  const propsPatch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawPatch)) {
    if (!UPDATE_SHAPE_ALLOWED_KEYS.has(key)) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        `update_shape patch key '${key}' is not allowed`,
        false,
      );
    }

    if (key === "x" || key === "y") {
      (partial as Record<string, unknown>)[key] = requireNumber(value, key);
      continue;
    }

    if (key === "text") {
      propsPatch.richText = toRichText(requireString(value, "text"));
      continue;
    }

    if (shape.type === "note") {
      if (key === "h") {
        throw new CanvasAgentError(
          "VALIDATION_ARG",
          "note shapes do not support props.h (height follows content). Omit h or create a new note.",
          true,
        );
      }
      if (key === "w") {
        propsPatch.scale = requireNumber(value, "w") / NOTE_BASE_WIDTH;
        continue;
      }
      if (key === "geo" || key === "fill") {
        throw new CanvasAgentError(
          "VALIDATION_ARG",
          `note shapes do not support patch key '${key}'`,
          true,
        );
      }
    }

    if (key === "geo" && shape.type === "geo") {
      propsPatch.geo = value;
      continue;
    }

    propsPatch[key] = value;
  }

  if (Object.keys(propsPatch).length > 0) {
    partial.props = propsPatch as TLShapePartial["props"];
  }

  return partial;
}

export function mergeShapeWithPartial(shape: TLShape, partial: TLShapePartial): TLShape {
  return {
    ...shape,
    ...partial,
    id: shape.id,
    type: shape.type,
    props: partial.props
      ? ({ ...shape.props, ...partial.props } as TLShape["props"])
      : shape.props,
  } as TLShape;
}

export function finalizeShapeForStore(editor: Editor, before: TLShape, partial: TLShapePartial): TLShape {
  const merged = mergeShapeWithPartial(before, partial);
  const util = editor.getShapeUtil?.(before);
  return util?.onBeforeUpdate?.(before, merged) ?? merged;
}
