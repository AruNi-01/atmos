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

/** tldraw v5 note sticky default width (page units); used to map CLI `--w` → `scale`. */
const NOTE_BASE_WIDTH = 200;

export interface CanvasAgentActor {
  actor_id: string;
  name?: string | null;
  color?: string | null;
}

export interface CanvasAgentDispatchInput {
  request_id: string;
  client_id?: string;
  command: string;
  args?: Record<string, unknown> | null;
  actor?: CanvasAgentActor | null;
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

export type CanvasAgentErrorCode =
  | "BRIDGE_DISABLED"
  | "EDITOR_NOT_READY"
  | "STALE_SHAPE_ID"
  | "VALIDATION_ARG"
  | "UNSUPPORTED_COMMAND"
  | "INTERNAL_ERROR";

const MAX_LAYOUT_GRID = 24;
const MAX_LAYOUT_IDS = 256;

/**
 * Allow-listed keys for `update-shape --patch`. We intentionally do NOT
 * forward arbitrary props blobs because tldraw's record validator would
 * happily accept (and silently misinterpret) wholesale prop overwrites.
 */
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

export interface CanvasAgentBusOptions {
  /**
   * Initial value of "Allow terminal/CLI control". The bus owns this flag
   * after construction; the React hook keeps it in sync via
   * `setBridgeAccepting`. When `false`, only `status` is allowed; everything
   * else answers with `BRIDGE_DISABLED`.
   */
  isBridgeAccepting?: boolean;
  /**
   * Presence sink — used by `canvas-agent-presence` to display the agent
   * cursor + camera and to keep Follow Agent in sync. The bus calls this
   * before/after every command so the presence record is "fresh" while the
   * agent is active.
   */
  onActorActivity?: (actor: CanvasAgentActor, editor: Editor) => void;
  /**
   * Optional logger — defaults to console.debug. Tests can pass `noop`.
   */
  log?: (message: string, payload?: unknown) => void;
}

export class CanvasAgentBus {
  private editor: Editor | null = null;
  private bridgeAccepting: boolean;

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

    if (input.actor && this.options.onActorActivity) {
      try {
        this.options.onActorActivity(input.actor, editor);
      } catch (err) {
        this.log("canvas-agent: actor activity hook failed", err);
      }
    }

    try {
      // `status` and `get_state` are always available — diagnostics must work
      // even while the bridge is disabled.
      if (command === "status") {
        return ok(this.runStatus(editor));
      }
      if (command === "get_state" || command === "get-state") {
        return ok(this.runGetState(editor, input.args ?? {}));
      }

      if (!this.bridgeAccepting) {
        return fail(
          "BRIDGE_DISABLED",
          "User has disabled 'Allow terminal/CLI control' for this Canvas tab.",
          true,
        );
      }

      switch (command) {
        case "create_note":
        case "create-note":
          return ok(this.runCreateNote(editor, input.args ?? {}));
        case "create_frame":
        case "create-frame":
          return ok(this.runCreateFrame(editor, input.args ?? {}));
        case "create_geo":
        case "create-geo":
          return ok(this.runCreateGeo(editor, input.args ?? {}));
        case "create_arrow":
        case "create-arrow":
          return ok(this.runCreateArrow(editor, input.args ?? {}));
        case "create_draw":
        case "create-draw":
          return ok(this.runCreateDraw(editor, input.args ?? {}));
        case "select":
          return ok(this.runSelect(editor, input.args ?? {}));
        case "clear_selection":
        case "clear-selection":
          return ok(this.runClearSelection(editor));
        case "move":
          return ok(this.runMove(editor, input.args ?? {}));
        case "delete":
          return ok(this.runDelete(editor, input.args ?? {}));
        case "layout_row":
        case "layout-row":
          return ok(this.runLayoutRow(editor, input.args ?? {}));
        case "layout_column":
        case "layout-column":
          return ok(this.runLayoutColumn(editor, input.args ?? {}));
        case "layout_grid":
        case "layout-grid":
          return ok(this.runLayoutGrid(editor, input.args ?? {}));
        case "update_shape":
        case "update-shape":
          return ok(this.runUpdateShape(editor, input.args ?? {}));
        case "viewport":
          return ok(this.runViewport(editor, input.args ?? {}));
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
        const textPreview = plainTextFromShapeProps(props);
        return {
          id: s.id,
          type: s.type,
          x: s.x,
          y: s.y,
          rotation: s.rotation,
          props,
          ...(textPreview ? { text_preview: textPreview } : {}),
          parent_id: s.parentId,
        };
      }),
    };
  }

  // ===== create =====

  private runCreateNote(editor: Editor, args: Record<string, unknown>) {
    const text = requireString(args.text, "text");
    const x = numberOr(args.x, computeSpawnX(editor));
    const y = numberOr(args.y, computeSpawnY(editor));
    const w = positiveNumberOr(args.w, NOTE_BASE_WIDTH);
    const color = optionalString(args.color);
    const id = createShapeId();
    // tldraw v5 notes use `richText`, not legacy `text`; they have no w/h props.
    const props: Record<string, unknown> = { richText: toRichText(text) };
    if (color) props.color = color;
    if (w !== NOTE_BASE_WIDTH) {
      props.scale = w / NOTE_BASE_WIDTH;
    }
    editor.createShape({ id, type: "note", x, y, props });
    return { id, type: "note" };
  }

  private runCreateFrame(editor: Editor, args: Record<string, unknown>) {
    const w = positiveNumberOr(args.w, 640);
    const h = positiveNumberOr(args.h, 440);
    const x = numberOr(args.x, computeSpawnX(editor));
    const y = numberOr(args.y, computeSpawnY(editor));
    const name = optionalString(args.title) ?? optionalString(args.name);
    const id = createShapeId();
    const props: Record<string, unknown> = { w, h };
    if (name) props.name = name;
    editor.createShape({ id, type: "frame", x, y, props });
    return { id, type: "frame" };
  }

  private runCreateGeo(editor: Editor, args: Record<string, unknown>) {
    const kind = optionalString(args.kind) ?? "rectangle";
    const x = numberOr(args.x, computeSpawnX(editor));
    const y = numberOr(args.y, computeSpawnY(editor));
    const w = positiveNumberOr(args.w, 200);
    const h = positiveNumberOr(args.h, 200);
    const id = createShapeId();
    const props: Record<string, unknown> = { geo: kind, w, h };
    const text = optionalString(args.text);
    if (text) props.richText = toRichText(text);
    const color = optionalString(args.color);
    if (color) props.color = color;
    const fill = optionalString(args.fill);
    if (fill) props.fill = fill;
    const size = optionalString(args.size);
    if (size) props.size = size;
    editor.createShape({ id, type: "geo", x, y, props });
    return { id, type: "geo" };
  }

  private runCreateArrow(editor: Editor, args: Record<string, unknown>) {
    const x1 = requireNumber(args.x1, "x1");
    const y1 = requireNumber(args.y1, "y1");
    const x2 = requireNumber(args.x2, "x2");
    const y2 = requireNumber(args.y2, "y2");
    const id = createShapeId();
    const props: Record<string, unknown> = {
      start: { x: 0, y: 0 },
      end: { x: x2 - x1, y: y2 - y1 },
    };
    const text = optionalString(args.text);
    if (text) props.richText = toRichText(text);
    const color = optionalString(args.color);
    if (color) props.color = color;
    const size = optionalString(args.size);
    if (size) props.size = size;
    editor.createShape({ id, type: "arrow", x: x1, y: y1, props });
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
    const color = optionalString(args.color);
    if (color) props.color = color;
    const size = optionalString(args.size);
    if (size) props.size = size;
    editor.createShape({
      id,
      type: "draw",
      x: Number(points[0]?.[0] ?? 0),
      y: Number(points[0]?.[1] ?? 0),
      props,
    });
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
    editor.updateShapes(patch);
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
    editor.deleteShapes(ids as TLShapeId[]);
    return { deleted: ids };
  }

  // ===== layout =====

  private runLayoutRow(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const gap = nonNegativeNumberOr(args.gap, 24);
    const shapes = this.requireExistingShapes(editor, ids);
    const yPin = optionalNumber(args.y);
    let cursor = shapes[0]?.x ?? 0;
    const patch: TLShapePartial[] = shapes.map((shape, idx) => {
      const w = readNumberProp(shape.props as Record<string, unknown>, "w") ?? 200;
      const x = idx === 0 ? shape.x : cursor;
      cursor = x + w + gap;
      return {
        id: shape.id,
        type: shape.type,
        x,
        y: yPin ?? shape.y,
      };
    });
    editor.updateShapes(patch);
    return { laid_out: ids };
  }

  private runLayoutColumn(editor: Editor, args: Record<string, unknown>) {
    const ids = requireIds(args.ids);
    const gap = nonNegativeNumberOr(args.gap, 24);
    const shapes = this.requireExistingShapes(editor, ids);
    const xPin = optionalNumber(args.x);
    let cursor = shapes[0]?.y ?? 0;
    const patch: TLShapePartial[] = shapes.map((shape, idx) => {
      const h = readNumberProp(shape.props as Record<string, unknown>, "h") ?? 200;
      const y = idx === 0 ? shape.y : cursor;
      cursor = y + h + gap;
      return {
        id: shape.id,
        type: shape.type,
        x: xPin ?? shape.x,
        y,
      };
    });
    editor.updateShapes(patch);
    return { laid_out: ids };
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
    const colWidth =
      Math.max(
        ...shapes.map(
          (s) => readNumberProp(s.props as Record<string, unknown>, "w") ?? 200,
        ),
      ) + gap;
    const rowHeight =
      Math.max(
        ...shapes.map(
          (s) => readNumberProp(s.props as Record<string, unknown>, "h") ?? 200,
        ),
      ) + gap;
    const baseX = shapes[0]?.x ?? 0;
    const baseY = shapes[0]?.y ?? 0;
    const patch: TLShapePartial[] = shapes.map((shape, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        id: shape.id,
        type: shape.type,
        x: baseX + col * colWidth,
        y: baseY + row * rowHeight,
      };
    });
    editor.updateShapes(patch);
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
    const next: TLShapePartial = { id: shape.id, type: shape.type };
    const propsPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
      if (!UPDATE_SHAPE_ALLOWED_KEYS.has(key)) {
        throw new CanvasAgentError(
          "VALIDATION_ARG",
          `update_shape patch key '${key}' is not allowed`,
          false,
        );
      }
      if (key === "x" || key === "y") {
        // Validate via the shared finite-number helper instead of `Number()`
        // which would happily pass NaN/Infinity into `updateShapes`.
        (next as Record<string, unknown>)[key] = requireNumber(value, key);
      } else if (key === "text") {
        // CLI/skill expose plain `text`; tldraw v5 stores labels as `richText`.
        if (typeof value !== "string") {
          throw new CanvasAgentError(
            "VALIDATION_ARG",
            "text must be a string",
            false,
          );
        }
        propsPatch.richText = toRichText(value);
      } else {
        propsPatch[key] = value;
      }
    }
    if (Object.keys(propsPatch).length) {
      next.props = propsPatch as TLShapePartial["props"];
    }
    editor.updateShapes([next]);
    return { id };
  }

  // ===== viewport =====

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

class CanvasAgentError extends Error {
  constructor(
    readonly code: CanvasAgentErrorCode,
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
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

function readNumberProp(props: Record<string, unknown>, key: string): number | undefined {
  const v = props?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function plainTextFromShapeProps(props: Record<string, unknown>): string | undefined {
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
      if (joined) return joined.slice(0, 500);
    }
  }
  const legacy = props.text;
  if (typeof legacy === "string" && legacy.trim()) {
    return legacy.trim().slice(0, 500);
  }
  return undefined;
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

function computeSpawnX(editor: Editor): number {
  return editor.getViewportPageBounds().center.x - 100;
}

function computeSpawnY(editor: Editor): number {
  return editor.getViewportPageBounds().center.y - 100;
}
