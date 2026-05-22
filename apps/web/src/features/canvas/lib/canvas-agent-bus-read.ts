import type { Editor, TLShapeId } from "tldraw";

import { getShapePageBoundsBox } from "./canvas-agent-bounds";
import { CanvasAgentError } from "./canvas-agent-errors";
import { computeCanvasLints } from "./canvas-agent-lint";
import {
  optionalString,
  parseOlderOffset,
  requireExistingShapes,
  resolveExtractTextShapeIds,
  shallowFilterProps,
} from "./canvas-agent-bus-helpers";
import {
  CANVAS_SHAPE_COPY_MAX_CHARS,
  textContentForExtract,
  textPreviewForGetState,
  truncateText,
} from "./canvas-shape-text";
import { extractCanvasTerminalText } from "./canvas-terminal-copy";
import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";

export function runCanvasAgentStatus(editor: Editor, bridgeAccepting: boolean) {
  return {
    ok: true,
    editor_ready: true,
    bridge_accepting: bridgeAccepting,
    page_id: editor.getCurrentPageId(),
    shape_count: editor.getCurrentPageShapes().length,
  };
}

export function runCanvasAgentGetState(
  editor: Editor,
  args: Record<string, unknown>,
) {
  const requestedPage = optionalString(args.page_id);
  const currentPageId = editor.getCurrentPageId();
  const pageId = (requestedPage ?? currentPageId) as ReturnType<
    Editor["getCurrentPageId"]
  >;
  if (requestedPage && !editor.getPages().some((p) => p.id === pageId)) {
    throw new CanvasAgentError(
      "STALE_SHAPE_ID",
      `Page ${requestedPage} does not exist`,
      true,
    );
  }
  // The downstream reads (`getCurrentPageShapes` / `getCamera` /
  // `getViewportPageBounds` / `getSelectedShapeIds`) always operate on the
  // active page. Returning them under a different `page_id` would produce
  // an internally inconsistent snapshot, so reject non-current pages until
  // per-page reads are wired up.
  if (requestedPage && pageId !== currentPageId) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      `get_state for a non-current page is not supported yet (requested ${requestedPage}, current ${currentPageId})`,
      false,
    );
  }
  const shapes = (editor.getCurrentPageShapesSorted?.() ??
    editor.getCurrentPageShapes()) as ReturnType<Editor["getCurrentPageShapes"]>;
  const camera = editor.getCamera();
  const viewport = editor.getViewportPageBounds();
  const selection = editor.getSelectedShapeIds();

  return {
    schema: "canvas_agent_state.v1",
    page_id: pageId,
    camera: { x: camera.x, y: camera.y, z: camera.z },
    viewport: {
      x: viewport.minX,
      y: viewport.minY,
      w: viewport.width,
      h: viewport.height,
    },
    selection,
    shapes: shapes.map((s) => {
      const props = shallowFilterProps(s.props as Record<string, unknown>);
      const textPreview = textPreviewForGetState(s);
      const bounds = getShapePageBoundsBox(editor, s.id);
      return {
        id: s.id,
        type: s.type,
        x: s.x,
        y: s.y,
        rotation: s.rotation,
        props,
        ...(bounds
          ? {
              bounds: {
                min_x: bounds.minX,
                min_y: bounds.minY,
                w: bounds.width,
                h: bounds.height,
              },
            }
          : {}),
        ...(textPreview ? { text_preview: textPreview } : {}),
        parent_id: s.parentId,
      };
    }),
    lints: computeCanvasLints(editor),
  };
}

export function runCanvasAgentLint(editor: Editor) {
  return { lints: computeCanvasLints(editor) };
}

export function runCanvasAgentSetStatus(args: Record<string, unknown>) {
  const raw = optionalString(args.status);
  if (!raw) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "set_status requires status: \"idle\" or \"active\"",
      false,
    );
  }
  const status = raw.trim().toLowerCase();
  if (status !== "idle" && status !== "active") {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      'status must be "idle" or "active"',
      false,
    );
  }
  return { status };
}

/** Read text content for specific shapes on demand (includes tmux capture for terminals). */
export async function runCanvasAgentExtractText(
  editor: Editor,
  args: Record<string, unknown>,
) {
  const ids = resolveExtractTextShapeIds(editor, args);
  requireExistingShapes(editor, ids);

  const shapes = [];
  for (const id of ids) {
    const shape = editor.getShape(id as TLShapeId);
    if (!shape) {
      shapes.push({ id, error: "not_found" as const });
      continue;
    }

    const olderOffset = parseOlderOffset(args.older_offset ?? args.skip_lines);

    let raw: string | undefined;
    let terminalPage: Record<string, unknown> | undefined;
    if (shape.type === CANVAS_TERMINAL_SHAPE_TYPE) {
      const captured = await extractCanvasTerminalText(shape as CanvasTerminalShape, {
        skipFromBottom: olderOffset,
      });
      raw = captured.text;
      terminalPage = {
        skip_lines: captured.page.skip_lines,
        lines_returned: captured.page.lines_returned,
        has_more_older: captured.page.has_more_older,
        next_older_offset: captured.page.next_skip_lines,
      };
    } else {
      raw = await textContentForExtract(editor, shape, {
        terminalSkipFromBottom: olderOffset,
      });
    }

    if (!raw?.trim()) {
      shapes.push({
        id: shape.id,
        type: shape.type,
        content: null,
        ...(terminalPage ? { terminal_page: terminalPage } : {}),
      });
      continue;
    }

    const { text, truncated } = truncateText(raw, CANVAS_SHAPE_COPY_MAX_CHARS);
    shapes.push({
      id: shape.id,
      type: shape.type,
      content: text,
      ...(truncated ? { truncated: true } : {}),
      ...(terminalPage ? { terminal_page: terminalPage } : {}),
    });
  }

  return {
    schema: "canvas_extract_text.v1",
    shapes,
  };
}
