import type { Editor, TLShapeId } from "tldraw";

import { CanvasAgentError } from "./canvas-agent-errors";

export const MAX_LAYOUT_GRID = 24;
export const MAX_LAYOUT_IDS = 256;
export const MAX_APPLY_STEPS = 32;

const SPAWN_GRID_COLS = 4;
const SPAWN_CELL_W = 120;
const SPAWN_CELL_H = 80;

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.length) {
    throw new CanvasAgentError("VALIDATION_ARG", `${label} must be a non-empty string`, false);
  }
  return value;
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new CanvasAgentError("VALIDATION_ARG", "expected a string", false);
  }
  return value;
}

export function requireNumber(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new CanvasAgentError("VALIDATION_ARG", `${label} must be a finite number`, false);
  }
  return n;
}

export function numberOr(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  return requireNumber(value, "number");
}

export function positiveNumberOr(value: unknown, fallback: number): number {
  const n = numberOr(value, fallback);
  if (!(n > 0)) {
    throw new CanvasAgentError("VALIDATION_ARG", "expected a positive number", false);
  }
  return n;
}

export function nonNegativeNumberOr(value: unknown, fallback: number): number {
  const n = numberOr(value, fallback);
  if (n < 0) {
    throw new CanvasAgentError("VALIDATION_ARG", "expected a non-negative number", false);
  }
  return n;
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireNumber(value, "number");
}

export function requirePositiveInt(value: unknown, label: string): number {
  const n = requireNumber(value, label);
  if (!Number.isInteger(n) || n <= 0) {
    throw new CanvasAgentError("VALIDATION_ARG", `${label} must be a positive integer`, false);
  }
  return n;
}

export function parseOlderOffset(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "older_offset must be a non-negative integer (use next_older_offset from the prior extract-text response)",
      false,
    );
  }
  return n;
}

export function resolveExtractTextShapeIds(
  editor: Editor,
  args: Record<string, unknown>,
): string[] {
  if (args.ids !== undefined && args.ids !== null) {
    return requireIds(args.ids);
  }
  const selected = editor.getSelectedShapeIds();
  if (selected.length === 0) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "extract_text requires --ids or a non-empty canvas selection",
      false,
    );
  }
  return selected as string[];
}

export function requireIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "ids must be a non-empty array",
      false,
    );
  }
  return value.map((v) => {
    const id = typeof v === "string" ? v : String(v ?? "");
    if (!id) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "ids contains an empty entry",
        false,
      );
    }
    return id;
  });
}

export function unionShapePageBounds(
  editor: Editor,
  ids: readonly string[],
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const id of ids) {
    const b = editor.getShapePageBounds(id as TLShapeId);
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

export function shallowFilterProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  // Limit props serialization to keep get-state payloads compact; only
  // include scalar/plain-object fields the agent is likely to act on.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
      out[k] = v;
    } else if (typeof v === "object") {
      try {
        out[k] = JSON.parse(JSON.stringify(v));
      } catch {
        // Skip unserialisable values.
      }
    }
  }
  return out;
}

export function resolveAutoSpawnPosition(
  editor: Editor,
  slot: number,
): { x: number; y: number } {
  const center = editor.getViewportPageBounds().center;
  const col = slot % SPAWN_GRID_COLS;
  const row = Math.floor(slot / SPAWN_GRID_COLS);
  return {
    x: center.x - 100 + col * SPAWN_CELL_W,
    y: center.y - 100 + row * SPAWN_CELL_H,
  };
}

export function requireExistingShapes(editor: Editor, ids: readonly string[]) {
  const shapes = ids.map((id) => {
    const shape = editor.getShape(id as TLShapeId);
    if (!shape) {
      throw new CanvasAgentError(
        "STALE_SHAPE_ID",
        `Shape ${id} does not exist; re-run get_state and retry.`,
        true,
      );
    }
    return shape;
  });
  return shapes;
}
