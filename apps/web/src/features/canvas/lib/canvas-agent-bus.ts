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
import { CanvasAgentError, type CanvasAgentErrorCode } from "./canvas-agent-errors";
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
import { runCanvasAgentApply } from "./canvas-agent-bus-apply";
import {
  MAX_LAYOUT_GRID,
  MAX_LAYOUT_IDS,
  nonNegativeNumberOr,
  numberOr,
  optionalNumber,
  optionalString,
  positiveNumberOr,
  requireExistingShapes,
  requireIds,
  requireNumber,
  requirePositiveInt,
  requireString,
  resolveAutoSpawnPosition,
} from "./canvas-agent-bus-helpers";
import {
  runCanvasAgentExtractText,
  runCanvasAgentGetState,
  runCanvasAgentLint,
  runCanvasAgentSetStatus,
  runCanvasAgentStatus,
} from "./canvas-agent-bus-read";
import {
  fail,
  ok,
  type CanvasAgentBusOptions,
  type CanvasAgentDispatchInput,
  type CanvasAgentResult,
} from "./canvas-agent-bus-result";
import {
  runCanvasAgentSetAgentView,
  runCanvasAgentViewport,
} from "./canvas-agent-bus-viewport";

export type { CanvasAgentErrorCode };
export type {
  CanvasAgentBusOptions,
  CanvasAgentDispatchInput,
  CanvasAgentFailure,
  CanvasAgentResult,
  CanvasAgentSuccess,
} from "./canvas-agent-bus-result";

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
        return ok(runCanvasAgentStatus(editor, this.bridgeAccepting));
      }
      if (command === "get_state" || command === "get-state") {
        return ok(runCanvasAgentGetState(editor, input.args ?? {}));
      }
      if (command === "extract_text" || command === "extract-text") {
        return ok(await runCanvasAgentExtractText(editor, input.args ?? {}));
      }
      if (command === "lint") {
        return ok(runCanvasAgentLint(editor));
      }
      if (command === "set_status" || command === "set-status") {
        return ok(runCanvasAgentSetStatus(input.args ?? {}));
      }

      if (!this.bridgeAccepting) {
        return fail(
          "BRIDGE_DISABLED",
          "User has disabled 'Allow terminal/CLI control' for this Canvas tab.",
          true,
        );
      }

      if (command === "apply") {
        return runCanvasAgentApply(input.args ?? {}, (subCommand, subArgs) =>
          this.runMutatingCommand(editor, subCommand, subArgs),
        );
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
          return ok(runCanvasAgentViewport(editor, args));
        case "set_agent_view":
        case "set-agent-view":
          return ok(runCanvasAgentSetAgentView(editor, args));
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
    if (fromId) requireExistingShapes(editor, [fromId]);
    if (toId) requireExistingShapes(editor, [toId]);

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
    requireExistingShapes(editor, ids);
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
    const shapes = requireExistingShapes(editor, ids);
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
    requireExistingShapes(editor, ids);
    mutateEditor(editor, () => editor.deleteShapes(ids as TLShapeId[]));
    return { deleted: ids };
  }

  // ===== layout =====

  private runLayoutRow(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const gap = nonNegativeNumberOr(args.gap, 24);
    const shapes = requireExistingShapes(editor, ids);
    const yPin = optionalNumber(args.y);
    mutateEditor(editor, () => layoutRowByBounds(editor, shapes, gap, yPin));
    return { laid_out: ids };
  }

  private runLayoutColumn(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const gap = nonNegativeNumberOr(args.gap, 24);
    const shapes = requireExistingShapes(editor, ids);
    const xPin = optionalNumber(args.x);
    mutateEditor(editor, () => layoutColumnByBounds(editor, shapes, gap, xPin));
    return { laid_out: ids };
  }

  private runAlign(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const alignment = parseAlignMode(args.alignment);
    const shapes = requireExistingShapes(editor, ids);
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
    const shapes = requireExistingShapes(editor, ids);
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
    const shapes = requireExistingShapes(editor, ids);
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
    const [shape, reference] = requireExistingShapes(editor, [id, referenceId]);
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
    const shapes = requireExistingShapes(editor, ids);
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
    const shape = requireExistingShapes(editor, [id])[0];
    const partial = planUpdateShapePartial(shape, patch as Record<string, unknown>);
    validateShapeUpdate(editor, shape, partial);
    mutateEditor(editor, () => editor.updateShapes([partial]));
    return { id };
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
    return resolveAutoSpawnPosition(editor, slot);
  }

  private log(message: string, payload?: unknown) {
    if (this.options.log) {
      this.options.log(message, payload);
    } else {
      console.debug(message, payload);
    }
  }
}
