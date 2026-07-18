import { Box, type Editor, type TLShape, type TLShapeId } from "tldraw";

import { getShapePageBoundsBox } from "./canvas-agent-bounds";
import { CanvasAgentError } from "./canvas-agent-errors";
import {
  nonNegativeNumberOr,
  optionalNumber,
  requireExistingShapes,
  requireIds,
  unionShapePageBounds,
} from "./canvas-agent-bus-helpers";
import {
  AGENT_VIEW_PADDING,
  expandBounds,
  type CanvasAgentBounds,
} from "./canvas-agent-view-bounds";
/** String literals avoid heavy shape-util imports on the agent path. */
const CANVAS_TERMINAL_SHAPE_TYPE = "canvas-terminal";
const CANVAS_WIDGET_SHAPE_TYPE = "canvas-widget";

/**
 * Screenshot only the agent-drawn region so product widgets / terminals
 * elsewhere on the canvas do not pollute visual verification.
 *
 * Shape inclusion rules (when region is known):
 * 1. Never include Atmos chrome: `canvas-terminal`, `canvas-widget`.
 * 2. Include a shape only if its center lies inside the region, OR ≥50% of
 *    its area intersects the region (so edge-grazing terminals stay out).
 * 3. Crop export with `bounds` so off-region paint is clipped.
 */

export type ScreenshotSize = "small" | "medium" | "large";

const MAX_EDGE: Record<ScreenshotSize, number> = {
  small: 768,
  medium: 1280,
  large: 2048,
};

const ATMOS_CHROME_TYPES = new Set<string>([
  CANVAS_TERMINAL_SHAPE_TYPE,
  CANVAS_WIDGET_SHAPE_TYPE,
]);

function parseSize(value: unknown): ScreenshotSize {
  const s = String(value ?? "medium").trim().toLowerCase();
  if (s === "small" || s === "medium" || s === "large") return s;
  throw new CanvasAgentError(
    "VALIDATION_ARG",
    'size must be "small", "medium", or "large"',
    false,
  );
}

function rectsIntersectArea(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const x1 = Math.max(a.minX, b.minX);
  const y1 = Math.max(a.minY, b.minY);
  const x2 = Math.min(a.maxX, b.maxX);
  const y2 = Math.min(a.maxY, b.maxY);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

function shapeQualifiesForRegion(
  bb: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; midX: number; midY: number },
  region: CanvasAgentBounds,
): boolean {
  const r = {
    minX: region.x,
    minY: region.y,
    maxX: region.x + region.w,
    maxY: region.y + region.h,
  };
  const centerInside =
    bb.midX >= r.minX && bb.midX <= r.maxX && bb.midY >= r.minY && bb.midY <= r.maxY;
  if (centerInside) return true;
  const area = Math.max(1, bb.width * bb.height);
  const overlap = rectsIntersectArea(bb, r);
  return overlap / area >= 0.5;
}

function resolveRegion(
  editor: Editor,
  args: Record<string, unknown>,
  getAgentViewBounds?: () => CanvasAgentBounds | null,
): CanvasAgentBounds {
  const padding = nonNegativeNumberOr(args.padding, AGENT_VIEW_PADDING);
  const x = optionalNumber(args.x);
  const y = optionalNumber(args.y);
  const w = optionalNumber(args.w);
  const h = optionalNumber(args.h);
  const hasBox =
    x !== undefined && y !== undefined && w !== undefined && h !== undefined;

  if (hasBox) {
    if (!(w! > 0) || !(h! > 0)) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "w and h must be positive for screenshot bounds",
        false,
      );
    }
    return expandBounds({ x: x!, y: y!, w: w!, h: h! }, padding);
  }

  const idsRaw = args.ids ?? args.center_ids;
  if (idsRaw !== undefined && idsRaw !== null) {
    const ids = requireIds(idsRaw);
    requireExistingShapes(editor, ids);
    const union = unionShapePageBounds(editor, ids);
    if (!union) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "screenshot ids have no measurable bounds",
        true,
      );
    }
    return expandBounds(union, padding);
  }

  const useAgentView =
    args.use_agent_view === true ||
    args.useAgentView === true ||
    args.region === "agent_view" ||
    args.region === "agent-view";

  if (useAgentView) {
    const view = getAgentViewBounds?.() ?? null;
    if (!view || !(view.w > 0) || !(view.h > 0)) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "No agent view is set. Call set-agent-view first, or pass --ids / --x --y --w --h.",
        true,
      );
    }
    // Agent view already includes its own padding from set-agent-view.
    return view;
  }

  // Default: union of all non-chrome shapes currently on the page (agent drawing surface).
  const contentIds: string[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (ATMOS_CHROME_TYPES.has(shape.type)) continue;
    contentIds.push(shape.id);
  }
  if (contentIds.length === 0) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "No non-chrome shapes to screenshot. Draw first or pass an explicit region.",
      true,
    );
  }
  const union = unionShapePageBounds(editor, contentIds);
  if (!union) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "Could not measure content bounds for screenshot",
      true,
    );
  }
  return expandBounds(union, padding);
}

function selectShapesForRegion(
  editor: Editor,
  region: CanvasAgentBounds,
  includeChrome: boolean,
  explicitIds?: string[],
): TLShape[] {
  const shapes = editor.getCurrentPageShapes();
  if (explicitIds && explicitIds.length) {
    const set = new Set(explicitIds);
    return shapes.filter((s) => {
      if (!set.has(s.id)) return false;
      if (!includeChrome && ATMOS_CHROME_TYPES.has(s.type)) return false;
      return true;
    });
  }

  return shapes.filter((shape) => {
    if (!includeChrome && ATMOS_CHROME_TYPES.has(shape.type)) return false;
    const bb = getShapePageBoundsBox(editor, shape.id);
    if (!bb) return false;
    return shapeQualifiesForRegion(bb, region);
  });
}

export async function runCanvasAgentScreenshot(
  editor: Editor,
  args: Record<string, unknown>,
  options?: {
    getAgentViewBounds?: () => CanvasAgentBounds | null;
  },
): Promise<Record<string, unknown>> {
  const size = parseSize(args.size);
  const includeChrome =
    args.include_widgets === true ||
    args.includeWidgets === true ||
    args.include_chrome === true;

  const region = resolveRegion(editor, args, options?.getAgentViewBounds);

  const idsRaw = args.ids ?? args.center_ids;
  const explicitIds =
    idsRaw !== undefined && idsRaw !== null ? requireIds(idsRaw) : undefined;

  const selected = selectShapesForRegion(editor, region, includeChrome, explicitIds);
  if (selected.length === 0) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "No shapes qualify inside the screenshot region (chrome widgets are excluded by default).",
      true,
    );
  }

  const longest = Math.max(region.w, region.h, 1);
  const maxEdge = MAX_EDGE[size];
  const pixelRatio = Math.min(2, maxEdge / longest);

  const boundsBox = new Box(region.x, region.y, region.w, region.h);

  let result: { url: string; width: number; height: number };
  try {
    result = await editor.toImageDataUrl(
      selected.map((s) => s.id as TLShapeId),
      {
        format: "jpeg",
        quality: 0.82,
        background: true,
        padding: 8,
        pixelRatio,
        bounds: boundsBox,
      },
    );
  } catch (err) {
    throw new CanvasAgentError(
      "INTERNAL_ERROR",
      `Screenshot export failed: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
  }

  if (!result?.url?.startsWith("data:")) {
    throw new CanvasAgentError(
      "INTERNAL_ERROR",
      "Screenshot export returned an empty image",
      true,
    );
  }

  // Soft size guard: if payload is huge, re-export smaller (agent JSON path).
  const approxBytes = Math.ceil((result.url.length * 3) / 4);
  if (approxBytes > 900_000 && size !== "small") {
    const retry = await editor.toImageDataUrl(
      selected.map((s) => s.id as TLShapeId),
      {
        format: "jpeg",
        quality: 0.72,
        background: true,
        padding: 8,
        pixelRatio: Math.min(1.25, MAX_EDGE.small / longest),
        bounds: new Box(region.x, region.y, region.w, region.h),
      },
    );
    if (retry?.url?.startsWith("data:")) {
      result = retry;
    }
  }

  return {
    schema: "canvas_agent_screenshot.v1",
    format: "jpeg",
    data_url: result.url,
    width: result.width,
    height: result.height,
    region,
    shape_ids: selected.map((s) => s.id),
    shape_count: selected.length,
    excluded_chrome: !includeChrome,
    size,
  };
}
