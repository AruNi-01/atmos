import {
  getArrowBindings,
  type Editor,
  type TLArrowShape,
  type TLShape,
  type TLShapeId,
} from "tldraw";

import { getShapePageBoundsBox, type ShapePageBounds } from "./canvas-agent-bounds";

/** Keep string literals here to avoid pulling heavy shape util modules into lint/tests. */
const CANVAS_TERMINAL_SHAPE_TYPE = "canvas-terminal";
const CANVAS_WIDGET_SHAPE_TYPE = "canvas-widget";

/** Local plain-text extract — do not import canvas-shape-text (heavy dep graph). */
function plainTextFromProps(props: Record<string, unknown>): string | undefined {
  const rich = props.richText;
  if (rich && typeof rich === "object" && !Array.isArray(rich)) {
    const content = (rich as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const lines = content.map((block) => {
        if (!block || typeof block !== "object") return "";
        const nodes = (block as { content?: unknown }).content;
        if (!Array.isArray(nodes)) return "";
        return nodes
          .map((node) =>
            node && typeof node === "object" && "text" in node
              ? String((node as { text: unknown }).text)
              : "",
          )
          .join("");
      });
      const joined = lines.join("\n").trim();
      if (joined) return joined;
    }
  }
  const legacy = props.text;
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return undefined;
}

/**
 * Canvas-agent lint model (aligned with tldraw offline helpers.getLints intent):
 *
 * - **overlap** — two *content* shapes unexpectedly collide (not parent/child,
 *   not containment, not arrows). Severity `error`.
 * - **text_overflow** — geo label likely exceeds its box (or tldraw growY>0
 *   collides with a neighbour). Severity `error` when colliding, else `warn`.
 * - **unbound_arrow** — arrow missing start/end binding. Severity `warn`
 *   (decorative arrows are allowed; diagram arrows should bind).
 */

export type CanvasAgentLintSeverity = "error" | "warn";

export type CanvasAgentLintType = "overlap" | "text_overflow" | "unbound_arrow";

export type CanvasAgentLint = {
  type: CanvasAgentLintType;
  severity: CanvasAgentLintSeverity;
  shape_ids: string[];
  message: string;
};

/** CLI-ready command suggestion to clear a lint (agent can `atmos canvas move` / `update-shape`). */
export type CanvasAgentLintFixSuggestion = {
  /** Index into the `lints` array this suggestion addresses. */
  lint_index: number;
  /** Canvas command verb (snake_case, matches bus). */
  command: string;
  args: Record<string, unknown>;
  reason: string;
};

const DEFAULT_SEPARATION_GAP = 24;

/** Shapes that are Atmos chrome / product widgets — never participate in layout lint. */
const NON_CONTENT_TYPES = new Set<string>([
  CANVAS_TERMINAL_SHAPE_TYPE,
  CANVAS_WIDGET_SHAPE_TYPE,
  "arrow",
  "frame",
  "group",
  "highlight",
]);

function isContentShape(shape: TLShape): boolean {
  return !NON_CONTENT_TYPES.has(shape.type);
}

function boxesOverlap(
  a: ShapePageBounds,
  b: ShapePageBounds,
  padding = 2,
): boolean {
  return !(
    a.maxX + padding < b.minX ||
    b.maxX + padding < a.minX ||
    a.maxY + padding < b.minY ||
    b.maxY + padding < a.minY
  );
}

/** True when one box approximately contains the other (frame wrapping cards). */
function boxesContain(
  a: ShapePageBounds,
  b: ShapePageBounds,
  tolerance = 2,
): boolean {
  const aContainsB =
    a.minX <= b.minX + tolerance &&
    a.minY <= b.minY + tolerance &&
    a.maxX >= b.maxX - tolerance &&
    a.maxY >= b.maxY - tolerance;
  const bContainsA =
    b.minX <= a.minX + tolerance &&
    b.minY <= a.minY + tolerance &&
    b.maxX >= a.maxX - tolerance &&
    b.maxY >= a.maxY - tolerance;
  return aContainsB || bContainsA;
}

function isAncestorOf(
  ancestorId: string,
  shape: TLShape,
  byId: Map<string, TLShape>,
): boolean {
  let parent = byId.get(shape.parentId as string);
  while (parent) {
    if (parent.id === ancestorId) return true;
    parent = byId.get(parent.parentId as string);
  }
  return false;
}

function shapesAreRelated(
  a: TLShape,
  b: TLShape,
  byId: Map<string, TLShape>,
): boolean {
  return isAncestorOf(a.id, b, byId) || isAncestorOf(b.id, a, byId);
}

/**
 * Heuristic: does the geo's label text likely overflow its fixed box?
 * Mirrors the offline `growY-on-shape` intent without requiring DOM measure.
 */
function geoTextMetrics(shape: TLShape): {
  text: string;
  w: number;
  h: number;
  lineH: number;
  neededH: number;
  overflows: boolean;
} | null {
  if (shape.type !== "geo") return null;
  const props = shape.props as unknown as Record<string, unknown>;
  const w = typeof props.w === "number" && props.w > 0 ? props.w : 200;
  const h = typeof props.h === "number" && props.h > 0 ? props.h : 200;
  const sizeToken = typeof props.size === "string" ? props.size : "m";
  const charW = sizeToken === "s" ? 6 : sizeToken === "l" ? 9 : sizeToken === "xl" ? 11 : 7.5;
  const lineH = sizeToken === "s" ? 14 : sizeToken === "l" ? 22 : sizeToken === "xl" ? 28 : 18;
  const pad = 16;

  if (typeof props.growY === "number" && props.growY > 0) {
    const text = plainTextFromProps(props) ?? "";
    return {
      text,
      w,
      h,
      lineH,
      neededH: Math.ceil(h + props.growY + pad),
      overflows: true,
    };
  }

  const text = plainTextFromProps(props);
  if (!text?.trim()) {
    return { text: "", w, h, lineH, neededH: h, overflows: false };
  }

  const usableW = Math.max(8, w - pad);
  const charsPerLine = Math.max(1, Math.floor(usableW / charW));
  let lines = 0;
  for (const line of text.split("\n")) {
    lines += Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine));
  }
  const neededH = Math.ceil(lines * lineH + pad);
  return { text, w, h, lineH, neededH, overflows: neededH > h };
}

export function estimateGeoTextOverflow(shape: TLShape): boolean {
  return geoTextMetrics(shape)?.overflows ?? false;
}

/**
 * Suggest moving `b` just far enough to clear `a` with a gutter.
 * Chooses the cheaper axis (smaller penetration).
 */
export function suggestOverlapSeparation(
  a: ShapePageBounds,
  b: ShapePageBounds,
  gap = DEFAULT_SEPARATION_GAP,
): { dx: number; dy: number } {
  const penX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const penY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (penX <= 0 || penY <= 0) return { dx: 0, dy: 0 };

  if (penX <= penY) {
    const pushRight = b.midX >= a.midX;
    return { dx: pushRight ? penX + gap : -(penX + gap), dy: 0 };
  }
  const pushDown = b.midY >= a.midY;
  return { dx: 0, dy: pushDown ? penY + gap : -(penY + gap) };
}

export function computeCanvasLints(editor: Editor): CanvasAgentLint[] {
  return computeCanvasLintsWithContext(editor).lints;
}

type LintWithContext = {
  lint: CanvasAgentLint;
  /** For overlap: bounds of both shapes in shape_ids order. */
  boxes?: [ShapePageBounds, ShapePageBounds];
  /** For text_overflow: suggested height. */
  neededH?: number;
};

function computeCanvasLintsWithContext(editor: Editor): {
  lints: CanvasAgentLint[];
  contexts: LintWithContext[];
} {
  const lints: CanvasAgentLint[] = [];
  const contexts: LintWithContext[] = [];
  const shapes = editor.getCurrentPageShapes();
  const byId = new Map(shapes.map((s) => [s.id as string, s]));

  const content: Array<{ shape: TLShape; bb: ShapePageBounds }> = [];
  for (const shape of shapes) {
    if (!isContentShape(shape)) continue;
    const bb = getShapePageBoundsBox(editor, shape.id);
    if (!bb || bb.width < 1 || bb.height < 1) continue;
    content.push({ shape, bb });
  }

  // Pairwise unexpected overlap among content shapes.
  for (let i = 0; i < content.length; i++) {
    for (let j = i + 1; j < content.length; j++) {
      const a = content[i]!;
      const b = content[j]!;
      if (shapesAreRelated(a.shape, b.shape, byId)) continue;
      if (boxesContain(a.bb, b.bb)) continue;
      if (!boxesOverlap(a.bb, b.bb)) continue;
      const lint: CanvasAgentLint = {
        type: "overlap",
        severity: "error",
        shape_ids: [a.shape.id, b.shape.id],
        message: `Shapes ${a.shape.id} and ${b.shape.id} overlap. Reposition with place/layout/move or recreate with non-overlapping coordinates.`,
      };
      lints.push(lint);
      contexts.push({ lint, boxes: [a.bb, b.bb] });
    }
  }

  // Text overflow on geo shapes.
  for (const { shape, bb } of content) {
    if (shape.type !== "geo") continue;
    const metrics = geoTextMetrics(shape);
    if (!metrics?.overflows) continue;

    const collides = content.some(
      (other) =>
        other.shape.id !== shape.id &&
        !shapesAreRelated(shape, other.shape, byId) &&
        !boxesContain(bb, other.bb) &&
        boxesOverlap(bb, other.bb, 0),
    );

    const lint: CanvasAgentLint = {
      type: "text_overflow",
      severity: collides ? "error" : "warn",
      shape_ids: [shape.id],
      message: collides
        ? `Shape ${shape.id} has overflowing text that collides with a neighbour. Increase --h/--w or shorten the label.`
        : `Shape ${shape.id} may have overflowing text. Increase --h/--w or shorten the label.`,
    };
    lints.push(lint);
    contexts.push({ lint, neededH: metrics.neededH });
  }

  // Unbound arrows (warn only — decorative arrows are intentional sometimes).
  for (const shape of shapes) {
    if (shape.type !== "arrow") continue;
    let hasStart = false;
    let hasEnd = false;
    try {
      const bindings = getArrowBindings(editor, shape as TLArrowShape);
      hasStart = Boolean(bindings.start);
      hasEnd = Boolean(bindings.end);
    } catch {
      // Incomplete editor stubs (unit tests) may not support arrow bindings.
      continue;
    }
    if (hasStart && hasEnd) continue;
    const missing: string[] = [];
    if (!hasStart) missing.push("start");
    if (!hasEnd) missing.push("end");
    const lint: CanvasAgentLint = {
      type: "unbound_arrow",
      severity: "warn",
      shape_ids: [shape.id as string],
      message: `Arrow ${shape.id} is missing ${missing.join(" and ")} binding(s). For diagrams use create-arrow --from-id / --to-id.`,
    };
    lints.push(lint);
    contexts.push({ lint });
  }

  return { lints, contexts };
}

/**
 * Build CLI-ready fix suggestions for lints that can be auto-remediated.
 * Overlaps → `move` the second shape; text overflow → `update_shape` taller h.
 * Unbound arrows have no automatic fix (need re-create with bindings).
 */
export function buildLintFixSuggestions(
  editor: Editor,
  options?: { gap?: number },
): {
  lints: CanvasAgentLint[];
  fix_suggestions: CanvasAgentLintFixSuggestion[];
} {
  const gap = options?.gap ?? DEFAULT_SEPARATION_GAP;
  const { lints, contexts } = computeCanvasLintsWithContext(editor);
  const fix_suggestions: CanvasAgentLintFixSuggestion[] = [];

  contexts.forEach((ctx, lint_index) => {
    if (ctx.lint.type === "overlap" && ctx.boxes) {
      const [boxA, boxB] = ctx.boxes;
      const moveId = ctx.lint.shape_ids[1]!;
      const { dx, dy } = suggestOverlapSeparation(boxA, boxB, gap);
      if (dx === 0 && dy === 0) return;
      fix_suggestions.push({
        lint_index,
        command: "move",
        args: { ids: [moveId], dx, dy },
        reason: `Separate ${ctx.lint.shape_ids[0]} and ${moveId} by moving the latter (${dx !== 0 ? `dx=${dx}` : `dy=${dy}`}).`,
      });
      return;
    }

    if (ctx.lint.type === "text_overflow" && ctx.neededH != null) {
      const id = ctx.lint.shape_ids[0]!;
      const shape = editor.getShape(id as TLShapeId);
      if (!shape || shape.type !== "geo") return;
      const currentH =
        typeof (shape.props as { h?: number }).h === "number"
          ? (shape.props as { h: number }).h
          : 0;
      const nextH = Math.max(ctx.neededH, currentH + 24);
      if (nextH <= currentH) return;
      fix_suggestions.push({
        lint_index,
        command: "update_shape",
        args: { id, patch: { h: nextH } },
        reason: `Grow ${id} height to ~${nextH} so the label fits.`,
      });
    }
  });

  return { lints, fix_suggestions };
}

export function summarizeLints(lints: CanvasAgentLint[]): {
  error_count: number;
  warn_count: number;
  clean: boolean;
} {
  let error_count = 0;
  let warn_count = 0;
  for (const lint of lints) {
    if (lint.severity === "error") error_count += 1;
    else warn_count += 1;
  }
  return { error_count, warn_count, clean: error_count === 0 };
}

/**
 * Occupied page rects for collision-aware spawn.
 * Includes diagram content, frames, and Atmos chrome so new shapes do not
 * land under terminals/widgets.
 */
export function collectContentOccupiedRects(
  editor: Editor,
  excludeIds?: ReadonlySet<string>,
): Array<{ x: number; y: number; w: number; h: number }> {
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (excludeIds?.has(shape.id as string)) continue;
    const include =
      isContentShape(shape) ||
      shape.type === "frame" ||
      shape.type === CANVAS_TERMINAL_SHAPE_TYPE ||
      shape.type === CANVAS_WIDGET_SHAPE_TYPE;
    if (!include) continue;
    const bb = getShapePageBoundsBox(editor, shape.id as TLShapeId);
    if (!bb || bb.width < 1 || bb.height < 1) continue;
    out.push({ x: bb.minX, y: bb.minY, w: bb.width, h: bb.height });
  }
  return out;
}
