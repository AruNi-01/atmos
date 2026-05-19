"use client";

/**
 * APP-015 Canvas Command Bus — browser-side execution of `atmos canvas <verb>`
 * commands relayed from `apps/api`.
 *
 * The bus is intentionally allow-list driven: each verb maps to a typed
 * handler that takes a validated args object, mutates the live tldraw
 * `Editor`, and returns a JSON-serialisable result. Server-side dispatch
 * arrives via the `canvas_agent_dispatch` WebSocket notification; the bus
 * answers with `canvas_agent_dispatch_result`.
 */

import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShapeId,
  type TLShapePartial,
} from "tldraw";

import {
  createArrowShapeWithBindings,
  resolveArrowEndpoints,
} from "./canvas-agent-arrow-bindings";
import { getShapePageBoundsBox } from "./canvas-agent-bounds";
import {
  AGENT_VIEW_PADDING,
  expandBounds,
  type CanvasAgentBounds,
} from "./canvas-agent-view-bounds";
import { CanvasAgentError, type CanvasAgentErrorCode } from "./canvas-agent-errors";
import { computeCanvasLints } from "./canvas-agent-lint";
import {
  CANVAS_SHAPE_COPY_MAX_CHARS,
  textContentForExtract,
  textPreviewForGetState,
  truncateText,
} from "./canvas-shape-text";
import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";
import { extractCanvasTerminalText } from "./canvas-terminal-copy";
import {
  layoutColumnByBounds,
  layoutGridByBounds,
  layoutRowByBounds,
  parseAlignMode,
  parseDistributeDirection,
  parsePlaceAlign,
  parsePlaceSide,
  parseStackDirection,
  runAlign as alignShapesCommand,
  runDistribute as distributeShapesCommand,
  runPlace as placeShapeCommand,
  runStack as stackShapesCommand,
} from "./canvas-agent-layout";
import { mutateEditor } from "./canvas-agent-mutate";
import { NOTE_BASE_WIDTH, planUpdateShapePartial } from "./canvas-agent-shape-patch";
import { applyOptionalColor, applyOptionalFill, applyOptionalSize } from "./canvas-agent-tldraw-style";
import { validateShapeUpdate } from "./canvas-agent-validate";

export interface CanvasAgentDispatchInput {
  request_id: string;
  client_id?: string;
  command: string;
  args?: Record<string, unknown> | null;
  deadline_ms?: number;
}

export interface CanvasAgentSuccess {
  success: true;
  data: unknown;
}

export interface CanvasAgentFailure {
  success: false;
  error_code: CanvasAgentErrorCode;
  error_message: string;
  recoverable: boolean;
  data?: unknown;
}

export type CanvasAgentResult = CanvasAgentSuccess | CanvasAgentFailure;

export type { CanvasAgentErrorCode };

const MAX_LAYOUT_GRID = 24;
const MAX_LAYOUT_IDS = 256;
const MAX_APPLY_STEPS = 32;
const SPAWN_GRID_COLS = 4;
const SPAWN_CELL_W = 120;
const SPAWN_CELL_H = 80;

export interface CanvasAgentBusOptions {
  /**
   * Initial value of "Allow terminal/CLI control". The bus owns this flag
   * after construction; the React hook keeps it in sync via
   * `setBridgeAccepting`. When `false`, only `status` is allowed; everything
   * else answers with `BRIDGE_DISABLED`.
   */
  isBridgeAccepting?: boolean;
  /**
   * Optional logger — defaults to console.debug. Tests can pass `noop`.
   */
  log?: (message: string, payload?: unknown) => void;
}

export class CanvasAgentBus {
  private editor: Editor | null = null;
  private bridgeAccepting: boolean;
  /** Stagger default spawn positions when x/y are omitted. */
  private spawnSlot = 0;

  constructor(private readonly options: CanvasAgentBusOptions) {
    this.bridgeAccepting = options.isBridgeAccepting ?? false;
  }

  setEditor(editor: Editor | null) {
    this.editor = editor;
  }

  setBridgeAccepting(value: boolean) {
    this.bridgeAccepting = value;
  }

  hasEditor(): boolean {
    return this.editor !== null;
  }

  async handleDispatch(input: CanvasAgentDispatchInput): Promise<CanvasAgentResult> {
    const editor = this.editor;
    if (!editor) {
      return fail(
        "EDITOR_NOT_READY",
        "Canvas editor is not mounted yet.",
        true,
      );
    }

    const command = (input.command ?? "").trim();
    if (!command) {
      return fail("VALIDATION_ARG", "command must be provided", false);
    }

    try {
      // `status`, `get_state`, and `extract_text` are always available — diagnostics
      // and on-demand shape reads must work even while the bridge is disabled.
      if (command === "status") {
        return ok(this.runStatus(editor));
      }
      if (command === "get_state" || command === "get-state") {
        return ok(this.runGetState(editor, input.args ?? {}));
      }
      if (command === "extract_text" || command === "extract-text") {
        return ok(await this.runExtractText(editor, input.args ?? {}));
      }
      if (command === "lint") {
        return ok(this.runLint(editor));
      }
      if (command === "set_status" || command === "set-status") {
        return ok(this.runSetStatus(input.args ?? {}));
      }

      if (!this.bridgeAccepting) {
        return fail(
          "BRIDGE_DISABLED",
          "User has disabled 'Allow terminal/CLI control' for this Canvas tab.",
          true,
        );
      }

      if (command === "apply") {
        return this.runApply(editor, input.args ?? {});
      }

      return this.runMutatingCommand(editor, command, input.args ?? {});
    } catch (err) {
      if (err instanceof CanvasAgentError) {
        return fail(err.code, err.message, err.recoverable);
      }
      this.log("canvas-agent: handler threw", err);
      return fail(
        "INTERNAL_ERROR",
        err instanceof Error ? err.message : String(err),
        true,
      );
    }
  }

  private runMutatingCommand(
    editor: Editor,
    command: string,
    args: Record<string, unknown>,
  ): CanvasAgentResult {
    try {
      switch (command) {
        case "create_note":
        case "create-note":
          return ok(this.runCreateNote(editor, args));
        case "create_frame":
        case "create-frame":
          return ok(this.runCreateFrame(editor, args));
        case "create_geo":
        case "create-geo":
          return ok(this.runCreateGeo(editor, args));
        case "create_arrow":
        case "create-arrow":
          return ok(this.runCreateArrow(editor, args));
        case "create_draw":
        case "create-draw":
          return ok(this.runCreateDraw(editor, args));
        case "select":
          return ok(this.runSelect(editor, args));
        case "clear_selection":
        case "clear-selection":
          return ok(this.runClearSelection(editor));
        case "move":
          return ok(this.runMove(editor, args));
        case "delete":
          return ok(this.runDelete(editor, args));
        case "layout_row":
        case "layout-row":
          return ok(this.runLayoutRow(editor, args));
        case "layout_column":
        case "layout-column":
          return ok(this.runLayoutColumn(editor, args));
        case "layout_grid":
        case "layout-grid":
          return ok(this.runLayoutGrid(editor, args));
        case "align":
          return ok(this.runAlign(editor, args));
        case "stack":
          return ok(this.runStack(editor, args));
        case "distribute":
          return ok(this.runDistribute(editor, args));
        case "place":
          return ok(this.runPlace(editor, args));
        case "update_shape":
        case "update-shape":
          return ok(this.runUpdateShape(editor, args));
        case "viewport":
          return ok(this.runViewport(editor, args));
        case "set_agent_view":
        case "set-agent-view":
          return ok(this.runSetAgentView(editor, args));
        default:
          return fail(
            "UNSUPPORTED_COMMAND",
            `Unknown canvas-agent command: ${command}`,
            false,
          );
      }
    } catch (err) {
      if (err instanceof CanvasAgentError) {
        return fail(err.code, err.message, err.recoverable);
      }
      this.log("canvas-agent: handler threw", err);
      return fail(
        "INTERNAL_ERROR",
        err instanceof Error ? err.message : String(err),
        true,
      );
    }
  }

  private runApply(
    editor: Editor,
    args: Record<string, unknown>,
  ): CanvasAgentResult {
    const steps = args.commands ?? args.actions;
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "apply requires a non-empty commands array",
        false,
      );
    }
    if (steps.length > MAX_APPLY_STEPS) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        `apply accepts at most ${MAX_APPLY_STEPS} commands per request`,
        false,
      );
    }

    const results: Array<{
      command: string;
      success: boolean;
      data?: unknown;
      error_code?: string;
      error_message?: string;
    }> = [];

    for (const step of steps) {
      if (!step || typeof step !== "object") {
        throw new CanvasAgentError(
          "VALIDATION_ARG",
          "each apply step must be an object with command and args",
          false,
        );
      }
      const record = step as Record<string, unknown>;
      const subCommand = String(record.command ?? "").trim();
      if (!subCommand) {
        throw new CanvasAgentError(
          "VALIDATION_ARG",
          "each apply step must include command",
          false,
        );
      }
      if (subCommand === "apply") {
        throw new CanvasAgentError(
          "VALIDATION_ARG",
          "nested apply is not supported",
          false,
        );
      }
      const subArgs =
        record.args && typeof record.args === "object" && !Array.isArray(record.args)
          ? (record.args as Record<string, unknown>)
          : {};
      const res = this.runMutatingCommand(editor, subCommand, subArgs);
      if (res.success) {
        results.push({ command: subCommand, success: true, data: res.data });
      } else {
        results.push({
          command: subCommand,
          success: false,
          error_code: res.error_code,
          error_message: res.error_message,
        });
        return ok({
          results,
          failed_at: results.length - 1,
          partial: true,
        });
      }
    }

    return ok({ results, partial: false });
  }

  // ===== read =====

  private runStatus(editor: Editor) {
    return {
      ok: true,
      editor_ready: true,
      bridge_accepting: this.bridgeAccepting,
      page_id: editor.getCurrentPageId(),
      shape_count: editor.getCurrentPageShapes().length,
    };
  }

  private runGetState(editor: Editor, args: Record<string, unknown>) {
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
      editor.getCurrentPageShapes()) as ReturnType<
      Editor["getCurrentPageShapes"]
    >;
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

  private runLint(editor: Editor) {
    return { lints: computeCanvasLints(editor) };
  }

  private runSetStatus(args: Record<string, unknown>) {
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
  private async runExtractText(editor: Editor, args: Record<string, unknown>) {
    const ids = resolveExtractTextShapeIds(editor, args);
    this.requireExistingShapes(editor, ids);

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

  // ===== create =====

  private runCreateNote(editor: Editor, args: Record<string, unknown>) {
    const text = requireString(args.text, "text");
    if (args.h !== undefined && args.h !== null) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "create_note does not support --h (notes auto-size). Use create-geo for fixed-height boxes.",
        false,
      );
    }
    const spawn = this.resolveSpawn(editor, args.x, args.y);
    const x = spawn.x;
    const y = spawn.y;
    const w = positiveNumberOr(args.w, NOTE_BASE_WIDTH);
    const color = optionalString(args.color);
    const id = createShapeId();
    // tldraw v5 notes use `richText`, not legacy `text`; they have no w/h props.
    const props: Record<string, unknown> = { richText: toRichText(text) };
    applyOptionalColor(props, color);
    if (w !== NOTE_BASE_WIDTH) {
      props.scale = w / NOTE_BASE_WIDTH;
    }
    mutateEditor(editor, () => editor.createShape({ id, type: "note", x, y, props }));
    return { id, type: "note" };
  }

  private runCreateFrame(editor: Editor, args: Record<string, unknown>) {
    const w = positiveNumberOr(args.w, 640);
    const h = positiveNumberOr(args.h, 440);
    const spawn = this.resolveSpawn(editor, args.x, args.y);
    const x = spawn.x;
    const y = spawn.y;
    const name = optionalString(args.title) ?? optionalString(args.name);
    const id = createShapeId();
    const props: Record<string, unknown> = { w, h };
    if (name) props.name = name;
    mutateEditor(editor, () => editor.createShape({ id, type: "frame", x, y, props }));
    return { id, type: "frame" };
  }

  private runCreateGeo(editor: Editor, args: Record<string, unknown>) {
    const kind = optionalString(args.kind) ?? "rectangle";
    const spawn = this.resolveSpawn(editor, args.x, args.y);
    const x = spawn.x;
    const y = spawn.y;
    const w = positiveNumberOr(args.w, 200);
    const h = positiveNumberOr(args.h, 200);
    const id = createShapeId();
    const props: Record<string, unknown> = { geo: kind, w, h };
    const text = optionalString(args.text);
    if (text) props.richText = toRichText(text);
    applyOptionalColor(props, optionalString(args.color));
    applyOptionalFill(props, optionalString(args.fill));
    applyOptionalSize(props, optionalString(args.size));
    mutateEditor(editor, () => editor.createShape({ id, type: "geo", x, y, props }));
    return { id, type: "geo" };
  }

  private runCreateArrow(editor: Editor, args: Record<string, unknown>) {
    const fromRaw = optionalString(args.from_id) ?? optionalString(args.fromId);
    const toRaw = optionalString(args.to_id) ?? optionalString(args.toId);
    const fromId = fromRaw ? (fromRaw as TLShapeId) : undefined;
    const toId = toRaw ? (toRaw as TLShapeId) : undefined;
    if (fromId) this.requireExistingShapes(editor, [fromId]);
    if (toId) this.requireExistingShapes(editor, [toId]);

    let endpoints: ReturnType<typeof resolveArrowEndpoints>;
    try {
      endpoints = resolveArrowEndpoints(editor, {
        x1: optionalNumber(args.x1),
        y1: optionalNumber(args.y1),
        x2: optionalNumber(args.x2),
        y2: optionalNumber(args.y2),
        fromId,
        toId,
      });
    } catch {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "create_arrow requires x1,y1,x2,y2 and/or --from-id / --to-id with resolvable shapes",
        false,
      );
    }

    const props: Record<string, unknown> = {};
    const text = optionalString(args.text);
    if (text) props.richText = toRichText(text);
    applyOptionalColor(props, optionalString(args.color));
    applyOptionalSize(props, optionalString(args.size));

    const id = createShapeId();
    mutateEditor(editor, () =>
      createArrowShapeWithBindings(editor, {
        id,
        x1: endpoints.x1,
        y1: endpoints.y1,
        x2: endpoints.x2,
        y2: endpoints.y2,
        fromId: endpoints.fromId,
        toId: endpoints.toId,
        props,
      }),
    );
    return { id, type: "arrow" };
  }

  private runCreateDraw(editor: Editor, args: Record<string, unknown>) {
    const points = args.points;
    if (!Array.isArray(points) || points.length < 2) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "points must be an array of at least 2 [x, y] pairs",
        false,
      );
    }
    type Segment = {
      type: "free";
      points: Array<{ x: number; y: number; z?: number }>;
    };
    const segment: Segment = { type: "free", points: [] };
    for (const raw of points) {
      if (!Array.isArray(raw) || raw.length < 2) {
        throw new CanvasAgentError(
          "VALIDATION_ARG",
          "each point must be a [x, y] pair",
          false,
        );
      }
      segment.points.push({
        x: Number(raw[0]) - Number(points[0]?.[0] ?? 0),
        y: Number(raw[1]) - Number(points[0]?.[1] ?? 0),
        z: 0.5,
      });
    }
    const id = createShapeId();
    const props: Record<string, unknown> = {
      segments: [segment],
      isComplete: true,
      isClosed: Boolean(args.closed),
    };
    applyOptionalColor(props, optionalString(args.color));
    applyOptionalSize(props, optionalString(args.size));
    mutateEditor(editor, () =>
      editor.createShape({
        id,
        type: "draw",
        x: Number(points[0]?.[0] ?? 0),
        y: Number(points[0]?.[1] ?? 0),
        props,
      }),
    );
    return { id, type: "draw" };
  }

  // ===== selection & transform =====

  private runSelect(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    this.requireExistingShapes(editor, ids);
    editor.select(...(ids as TLShapeId[]));
    return { selected: ids };
  }

  private runClearSelection(editor: Editor) {
    editor.selectNone();
    return { selected: [] };
  }

  private runMove(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const dx = requireNumber(args.dx, "dx");
    const dy = requireNumber(args.dy, "dy");
    const shapes = this.requireExistingShapes(editor, ids);
    const patch: TLShapePartial[] = shapes.map((shape) => ({
      id: shape.id,
      type: shape.type,
      x: shape.x + dx,
      y: shape.y + dy,
    }));
    mutateEditor(editor, () => editor.updateShapes(patch));
    return { moved: ids, dx, dy };
  }

  private runDelete(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    // Must be the literal boolean `true` — a truthy check would let
    // accidental string/number values silently authorise destructive deletes.
    if (args.confirm !== true) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "delete requires { confirm: true }",
        false,
      );
    }
    this.requireExistingShapes(editor, ids);
    mutateEditor(editor, () => editor.deleteShapes(ids as TLShapeId[]));
    return { deleted: ids };
  }

  // ===== layout =====

  private runLayoutRow(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const gap = nonNegativeNumberOr(args.gap, 24);
    const shapes = this.requireExistingShapes(editor, ids);
    const yPin = optionalNumber(args.y);
    mutateEditor(editor, () => layoutRowByBounds(editor, shapes, gap, yPin));
    return { laid_out: ids };
  }

  private runLayoutColumn(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const gap = nonNegativeNumberOr(args.gap, 24);
    const shapes = this.requireExistingShapes(editor, ids);
    const xPin = optionalNumber(args.x);
    mutateEditor(editor, () => layoutColumnByBounds(editor, shapes, gap, xPin));
    return { laid_out: ids };
  }

  private runAlign(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const alignment = parseAlignMode(args.alignment);
    const shapes = this.requireExistingShapes(editor, ids);
    if (shapes.length < 2) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "align requires at least two shape ids",
        false,
      );
    }
    mutateEditor(editor, () => alignShapesCommand(editor, shapes, alignment));
    return { aligned: ids, alignment };
  }

  private runStack(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const direction = parseStackDirection(args.direction);
    const gap = nonNegativeNumberOr(args.gap, 24);
    const shapes = this.requireExistingShapes(editor, ids);
    if (shapes.length < 2) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "stack requires at least two shape ids",
        false,
      );
    }
    mutateEditor(editor, () => stackShapesCommand(editor, shapes, direction, gap));
    return { stacked: ids, direction, gap };
  }

  private runDistribute(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const direction = parseDistributeDirection(args.direction);
    const shapes = this.requireExistingShapes(editor, ids);
    if (shapes.length < 3) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "distribute requires at least three shape ids",
        false,
      );
    }
    mutateEditor(editor, () => distributeShapesCommand(editor, shapes, direction));
    return { distributed: ids, direction };
  }

  private runPlace(editor: Editor, args: Record<string, unknown>) {
    const id = requireString(args.id, "id");
    const referenceId =
      optionalString(args.reference_id) ?? optionalString(args.referenceId);
    if (!referenceId) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "place requires reference_id",
        false,
      );
    }
    const side = parsePlaceSide(args.side);
    const align = parsePlaceAlign(args.align);
    const sideOffset = nonNegativeNumberOr(args.side_offset ?? args.sideOffset, 0);
    const alignOffset = numberOr(args.align_offset ?? args.alignOffset, 0);
    const [shape, reference] = this.requireExistingShapes(editor, [id, referenceId]);
    mutateEditor(editor, () =>
      placeShapeCommand(editor, shape, reference, side, align, sideOffset, alignOffset),
    );
    return { id, reference_id: referenceId, side, align };
  }

  private runLayoutGrid(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    if (ids.length > MAX_LAYOUT_IDS) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        `layout_grid accepts at most ${MAX_LAYOUT_IDS} ids`,
        false,
      );
    }
    const cols = requirePositiveInt(args.cols, "cols");
    const rows = requirePositiveInt(args.rows, "rows");
    if (cols > MAX_LAYOUT_GRID || rows > MAX_LAYOUT_GRID) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        `layout_grid is capped at ${MAX_LAYOUT_GRID}×${MAX_LAYOUT_GRID}`,
        false,
      );
    }
    if (ids.length > rows * cols) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        `${ids.length} shapes do not fit into a ${rows}×${cols} grid`,
        false,
      );
    }
    const gap = nonNegativeNumberOr(args.gap, 24);
    const shapes = this.requireExistingShapes(editor, ids);
    mutateEditor(editor, () => layoutGridByBounds(editor, shapes, cols, rows, gap));
    return { laid_out: ids, rows, cols };
  }

  // ===== mutate =====

  private runUpdateShape(editor: Editor, args: Record<string, unknown>) {
    const id = requireString(args.id, "id");
    const patch = args.patch;
    if (!patch || typeof patch !== "object") {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "patch must be a JSON object",
        false,
      );
    }
    const shape = this.requireExistingShapes(editor, [id])[0];
    const partial = planUpdateShapePartial(shape, patch as Record<string, unknown>);
    validateShapeUpdate(editor, shape, partial);
    mutateEditor(editor, () => editor.updateShapes([partial]));
    return { id };
  }

  // ===== viewport =====

  private runSetAgentView(editor: Editor, args: Record<string, unknown>) {
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
      this.requireExistingShapes(editor, ids);
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

  private runViewport(editor: Editor, args: Record<string, unknown>) {
    const centerIds = args.center_ids;
    if (Array.isArray(centerIds) && centerIds.length) {
      const ids = centerIds.map((v) => String(v));
      this.requireExistingShapes(editor, ids);
      // Compute the union of the requested shapes' page bounds so the camera
      // actually frames *those* shapes — the previous implementation used
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

  // ===== helpers =====

  private resolveSpawn(
    editor: Editor,
    xArg: unknown,
    yArg: unknown,
  ): { x: number; y: number } {
    if (xArg !== undefined && xArg !== null && yArg !== undefined && yArg !== null) {
      return { x: requireNumber(xArg, "x"), y: requireNumber(yArg, "y") };
    }
    if (
      (xArg !== undefined && xArg !== null) ||
      (yArg !== undefined && yArg !== null)
    ) {
      throw new CanvasAgentError(
        "VALIDATION_ARG",
        "provide both x and y, or omit both for auto placement",
        false,
      );
    }
    const slot = this.spawnSlot++;
    return { x: computeSpawnX(editor, slot), y: computeSpawnY(editor, slot) };
  }

  private requireExistingShapes(editor: Editor, ids: readonly string[]) {
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

  private log(message: string, payload?: unknown) {
    if (this.options.log) {
      this.options.log(message, payload);
    } else {
      console.debug(message, payload);
    }
  }
}

function ok(data: unknown): CanvasAgentSuccess {
  return { success: true, data };
}

function fail(
  code: CanvasAgentErrorCode,
  message: string,
  recoverable: boolean,
): CanvasAgentFailure {
  return { success: false, error_code: code, error_message: message, recoverable };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.length) {
    throw new CanvasAgentError("VALIDATION_ARG", `${label} must be a non-empty string`, false);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new CanvasAgentError("VALIDATION_ARG", "expected a string", false);
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

function numberOr(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  return requireNumber(value, "number");
}

function positiveNumberOr(value: unknown, fallback: number): number {
  const n = numberOr(value, fallback);
  if (!(n > 0)) {
    throw new CanvasAgentError("VALIDATION_ARG", "expected a positive number", false);
  }
  return n;
}

function nonNegativeNumberOr(value: unknown, fallback: number): number {
  const n = numberOr(value, fallback);
  if (n < 0) {
    throw new CanvasAgentError("VALIDATION_ARG", "expected a non-negative number", false);
  }
  return n;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireNumber(value, "number");
}

function requirePositiveInt(value: unknown, label: string): number {
  const n = requireNumber(value, label);
  if (!Number.isInteger(n) || n <= 0) {
    throw new CanvasAgentError("VALIDATION_ARG", `${label} must be a positive integer`, false);
  }
  return n;
}

function parseOlderOffset(value: unknown): number {
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

function resolveExtractTextShapeIds(
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

function requireIds(value: unknown): string[] {
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

function unionShapePageBounds(
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

function shallowFilterProps(props: Record<string, unknown>): Record<string, unknown> {
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

function nextSpawnOffset(slot: number): { dx: number; dy: number } {
  const col = slot % SPAWN_GRID_COLS;
  const row = Math.floor(slot / SPAWN_GRID_COLS);
  return { dx: col * SPAWN_CELL_W, dy: row * SPAWN_CELL_H };
}

function computeSpawnX(editor: Editor, slot: number): number {
  const center = editor.getViewportPageBounds().center;
  return center.x - 100 + nextSpawnOffset(slot).dx;
}

function computeSpawnY(editor: Editor, slot: number): number {
  const center = editor.getViewportPageBounds().center;
  return center.y - 100 + nextSpawnOffset(slot).dy;
}
