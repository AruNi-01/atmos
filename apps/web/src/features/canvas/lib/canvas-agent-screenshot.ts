import { Box, type Editor, type TLShape, type TLShapeId } from "tldraw";

import { getShapePageBoundsBox } from "./canvas-agent-bounds";
import { CanvasAgentError } from "./canvas-agent-errors";
import {
  nonNegativeNumberOr,
  optionalNumber,
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
 * Screenshot the agent-drawn region so product chrome does not pollute
 * visual verification by default.
 *
 * Shape inclusion rules (when region is known):
 * 1. Exclude Atmos chrome (`canvas-terminal`, `canvas-widget`) unless
 *    `include_widgets` is set.
 * 2. Include a shape only if its center lies inside the region, OR ≥50% of
 *    its area intersects the region.
 * 3. Crop export with `bounds` so off-region paint is clipped.
 * 4. Explicit `--ids` must exist and live on the **current page**.
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
  bb: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    midX: number;
    midY: number;
  },
  region: CanvasAgentBounds,
): boolean {
  const r = {
    minX: region.x,
    minY: region.y,
    maxX: region.x + region.w,
    maxY: region.y + region.h,
  };
  const centerInside =
    bb.midX >= r.minX &&
    bb.midX <= r.maxX &&
    bb.midY >= r.minY &&
    bb.midY <= r.maxY;
  if (centerInside) return true;
  const area = Math.max(1, bb.width * bb.height);
  const overlap = rectsIntersectArea(bb, r);
  return overlap / area >= 0.5;
}

/** Require every id to exist and live on the current page (screenshotable). */
function requireScreenshotableIds(editor: Editor, ids: readonly string[]): TLShape[] {
  const pageShapeIds = new Set(
    editor.getCurrentPageShapes().map((s) => s.id as string),
  );
  return ids.map((id) => {
    const shape = editor.getShape(id as TLShapeId);
    if (!shape) {
      throw new CanvasAgentError(
        "STALE_SHAPE_ID",
        `Shape ${id} does not exist; re-run get_state and retry.`,
        true,
      );
    }
    if (!pageShapeIds.has(id)) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        `Shape ${id} is not on the current page and cannot be screenshotted. Switch pages or pass current-page ids.`,
        false,
      );
    }
    return shape;
  });
}

function resolveRegion(
  editor: Editor,
  args: Record<string, unknown>,
  getAgentViewBounds: (() => CanvasAgentBounds | null) | undefined,
  includeChrome: boolean,
): CanvasAgentBounds {
  const padding = nonNegativeNumberOr(args.padding, AGENT_VIEW_PADDING);
  const x = optionalNumber(args.x);
  const y = optionalNumber(args.y);
  const w = optionalNumber(args.w);
  const h = optionalNumber(args.h);
  const anyBoundField =
    x !== undefined || y !== undefined || w !== undefined || h !== undefined;
  const hasCompleteBox =
    x !== undefined && y !== undefined && w !== undefined && h !== undefined;

  if (anyBoundField && !hasCompleteBox) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "screenshot bounds require all of x, y, w, and h (or omit all four)",
      false,
    );
  }

  if (hasCompleteBox) {
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
    requireScreenshotableIds(editor, ids);
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
    return view;
  }

  // Default region: union of shapes on the current page.
  // When include_widgets is false, skip Atmos chrome; when true, include them.
  const contentIds: string[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (!includeChrome && ATMOS_CHROME_TYPES.has(shape.type)) continue;
    contentIds.push(shape.id);
  }
  if (contentIds.length === 0) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      includeChrome
        ? "No shapes to screenshot on the current page."
        : "No non-chrome shapes to screenshot. Draw first, pass an explicit region, or use --include-widgets.",
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
  if (explicitIds && explicitIds.length) {
    // Already validated as current-page shapes in resolveRegion / call site.
    return requireScreenshotableIds(editor, explicitIds).filter((s) => {
      if (!includeChrome && ATMOS_CHROME_TYPES.has(s.type)) return false;
      return true;
    });
  }

  return editor.getCurrentPageShapes().filter((shape) => {
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

  const region = resolveRegion(
    editor,
    args,
    options?.getAgentViewBounds,
    includeChrome,
  );

  const idsRaw = args.ids ?? args.center_ids;
  const explicitIds =
    idsRaw !== undefined && idsRaw !== null ? requireIds(idsRaw) : undefined;

  const selected = selectShapesForRegion(
    editor,
    region,
    includeChrome,
    explicitIds,
  );
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
