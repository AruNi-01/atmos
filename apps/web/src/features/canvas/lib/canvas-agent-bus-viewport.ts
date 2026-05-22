import type { Editor } from "tldraw";

import {
  AGENT_VIEW_PADDING,
  expandBounds,
  type CanvasAgentBounds,
} from "./canvas-agent-view-bounds";
import { CanvasAgentError } from "./canvas-agent-errors";
import {
  nonNegativeNumberOr,
  optionalNumber,
  requireExistingShapes,
  unionShapePageBounds,
} from "./canvas-agent-bus-helpers";

export function runCanvasAgentSetAgentView(
  editor: Editor,
  args: Record<string, unknown>,
) {
  const padding = nonNegativeNumberOr(args.padding, AGENT_VIEW_PADDING);
  const shouldZoom = args.zoom === true;
  const x = optionalNumber(args.x);
  const y = optionalNumber(args.y);
  const w = optionalNumber(args.w);
  const h = optionalNumber(args.h);
  const hasBox =
    x !== undefined && y !== undefined && w !== undefined && h !== undefined;

  let view: CanvasAgentBounds;

  if (hasBox) {
    if (!(w! > 0) || !(h! > 0)) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "w and h must be positive when setting agent view",
        false,
      );
    }
    view = expandBounds({ x: x!, y: y!, w: w!, h: h! }, padding);
  } else {
    const centerIds = args.center_ids;
    if (!Array.isArray(centerIds) || centerIds.length === 0) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "set_agent_view requires x,y,w,h or center_ids",
        false,
      );
    }
    const ids = centerIds.map((v) => String(v));
    requireExistingShapes(editor, ids);
    const union = unionShapePageBounds(editor, ids);
    if (!union) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "center_ids shapes have no measurable bounds",
        true,
      );
    }
    view = expandBounds(union, padding);
  }

  if (shouldZoom) {
    editor.zoomToBounds(
      { x: view.x, y: view.y, w: view.w, h: view.h },
      { animation: { duration: 200 } },
    );
  }

  return { view };
}

export function runCanvasAgentViewport(
  editor: Editor,
  args: Record<string, unknown>,
) {
  const centerIds = args.center_ids;
  if (Array.isArray(centerIds) && centerIds.length) {
    const ids = centerIds.map((v) => String(v));
    requireExistingShapes(editor, ids);
    // Compute the union of the requested shapes' page bounds so the camera
    // actually frames *those* shapes; the previous implementation used
    // `getSelectionPageBounds()` (which ignores the requested ids) and then
    // immediately overrode it with `zoomToFit`, defeating the request.
    const bounds = unionShapePageBounds(editor, ids);
    if (bounds) {
      editor.zoomToBounds(bounds, {
        targetZoom: optionalNumber(args.zoom) ?? undefined,
        animation: { duration: 200 },
      });
    }
  } else {
    const zoom = optionalNumber(args.zoom);
    const panX = optionalNumber(args.pan_x);
    const panY = optionalNumber(args.pan_y);
    const camera = editor.getCamera();
    editor.setCamera({
      x: panX ?? camera.x,
      y: panY ?? camera.y,
      z: zoom ?? camera.z,
    });
  }
  const camera = editor.getCamera();
  return { camera: { x: camera.x, y: camera.y, z: camera.z } };
}
