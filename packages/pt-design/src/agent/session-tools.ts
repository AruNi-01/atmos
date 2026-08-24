import { encodeDesignIR } from "../ir/encode";
import type { DesignIR } from "../ir/schema";
import type { PtDesignSession } from "../core/session";
import { estimateTextWidth } from "../catalog/primitives";
import { defaultPlaceVariant } from "../catalog/place-sets";
import { getCatalogEntry } from "../catalog/registry";
import { rectsOverlap, type PlaceRect } from "../catalog/place-clear";
import { PT_ERROR_CODES, PtDesignError } from "./errors";
import { layoutColumn, layoutGrid, layoutRow, type LayoutAlign } from "./layout";
import { lintDesignIR } from "./lint";
import {
  PT_DESIGN_TOOL_DEFS,
  liveBoardToolNames,
  unknownToolMessage,
  usageMessage,
  type ToolName,
} from "./tool-defs";
import type { BBox, PtElement } from "../core/types";

export type ToolCall = {
  name: ToolName;
  args: Record<string, unknown>;
};

export const FRAME_PRESETS: Record<string, { w: number; h: number }> = {
  desktop: { w: 1440, h: 1024 },
  tablet: { w: 768, h: 1024 },
  mobile: { w: 390, h: 844 },
};

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

export function toNum(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function num(args: Record<string, unknown>, key: string, fallback = 0): number {
  return toNum(args[key], fallback);
}

function hasOwn(args: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(args, key);
}

function point(args: Record<string, unknown>): { x: number; y: number } {
  const atRaw = args.at;
  let x = num(args, "x");
  let y = num(args, "y");
  if (atRaw && typeof atRaw === "object") {
    const rec = atRaw as Record<string, unknown>;
    x = toNum(rec.x, x);
    y = toNum(rec.y, y);
  }
  return { x, y };
}

function instanceIdsArg(args: Record<string, unknown>): string[] {
  if (Array.isArray(args.instanceIds)) return (args.instanceIds as unknown[]).map(String).filter(Boolean);
  if (typeof args.instanceIds === "string" && args.instanceIds.trim()) {
    return args.instanceIds.split(",").map((id) => id.trim()).filter(Boolean);
  }
  if (typeof args.instanceId === "string" && args.instanceId) return [args.instanceId];
  return [];
}

function alignArg(args: Record<string, unknown>): LayoutAlign {
  const value = str(args, "align");
  if (value === "center" || value === "end" || value === "start") return value;
  return "start";
}

function instanceRoot(session: PtDesignSession, instanceId: string): PtElement | undefined {
  return session.getScene().elements.find(
    (el) => !el.isDeleted && el.customData?.pt?.instanceId === instanceId && el.customData.pt.componentType,
  );
}

function parseRef(
  args: Record<string, unknown>,
  key: string,
): { instanceId: string; gap: number } | undefined {
  const raw = args[key];
  if (typeof raw === "string" && raw) return { instanceId: raw, gap: 16 };
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const instanceId = typeof rec.instanceId === "string" ? rec.instanceId : undefined;
    if (!instanceId) return undefined;
    return { instanceId, gap: rec.gap == null ? 16 : toNum(rec.gap, 16) };
  }
  return undefined;
}

function resolvePlaceAt(
  session: PtDesignSession,
  args: Record<string, unknown>,
): { at: { x: number; y: number }; frameId?: string } {
  const below = parseRef(args, "below");
  const rightOf = parseRef(args, "rightOf");
  if (below && rightOf) {
    throw new PtDesignError(PT_ERROR_CODES.USAGE, usageMessage("pt_place", "Use below or rightOf, not both"));
  }
  let frameId = str(args, "frameId") ?? str(args, "frame");
  const anchorId = below?.instanceId ?? rightOf?.instanceId;
  if (anchorId) {
    const root = instanceRoot(session, anchorId);
    if (!root) throw new PtDesignError(PT_ERROR_CODES.NOT_FOUND, `Instance not found: ${anchorId}`);
    if (!frameId && root.frameId) frameId = root.frameId;
    const gap = below?.gap ?? rightOf?.gap ?? 16;
    if (below) return { at: { x: root.x, y: root.y + root.height + gap }, frameId };
    return { at: { x: root.x + root.width + gap, y: root.y }, frameId };
  }
  const at = point(args);
  if (!frameId) return { at, frameId };
  const frame = session.resolveFrame(frameId);
  if (!frame) throw new PtDesignError(PT_ERROR_CODES.NOT_FOUND, `Frame not found: ${frameId}`);
  return { at: { x: frame.x + at.x, y: frame.y + at.y }, frameId };
}

function bboxFromRoot(root: PtElement | undefined): BBox | undefined {
  if (!root) return undefined;
  return { x: root.x, y: root.y, w: root.width, h: root.height };
}

function parseBBox(args: Record<string, unknown>): Partial<BBox> | undefined {
  const raw = args.bbox;
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const next: Partial<BBox> = {};
    if (rec.x != null) next.x = toNum(rec.x);
    if (rec.y != null) next.y = toNum(rec.y);
    if (rec.w != null) next.w = toNum(rec.w);
    if (rec.h != null) next.h = toNum(rec.h);
    return next;
  }
  return undefined;
}

type PlaceWarning = { code: string; message: string };

function placeWarnings(input: {
  session: PtDesignSession;
  componentType: string;
  props?: Record<string, unknown>;
  instanceIds: string[];
  frameId?: string;
}): PlaceWarning[] {
  const warnings: PlaceWarning[] = [];
  const entry = getCatalogEntry(input.componentType);
  if (input.props) {
    const allowed = new Set(entry.propKeys);
    for (const key of Object.keys(input.props)) {
      if (!allowed.has(key)) {
        warnings.push({
          code: "PROP_IGNORED",
          message: `${input.componentType} ignores prop "${key}". Editable: ${entry.propKeys.join(", ") || "(none)"}`,
        });
      }
    }
  }
  const frame = input.frameId ? input.session.resolveFrame(input.frameId) : undefined;
  const others: PlaceRect[] = input.session
    .getScene()
    .elements.filter(
      (el) =>
        !el.isDeleted &&
        el.customData?.pt?.componentType &&
        el.customData.pt.instanceId &&
        !input.instanceIds.includes(el.customData.pt.instanceId),
    )
    .map((el) => ({ x: el.x, y: el.y, w: el.width, h: el.height }));
  for (const id of input.instanceIds) {
    const root = instanceRoot(input.session, id);
    const bbox = bboxFromRoot(root);
    if (!bbox || !root) continue;
    if (frame) {
      const inside =
        bbox.x >= frame.x &&
        bbox.y >= frame.y &&
        bbox.x + bbox.w <= frame.x + frame.width &&
        bbox.y + bbox.h <= frame.y + frame.height;
      if (!inside) {
        warnings.push({
          code: "OUTSIDE_FRAME",
          message: `${id} is outside the frame`,
        });
      }
    }
    if (others.some((rect) => rectsOverlap(bbox, rect))) {
      warnings.push({ code: "OVERLAP", message: `${id} overlaps another instance` });
    }
    const label = typeof root.customData?.pt?.props?.label === "string" ? root.customData.pt.props.label : "";
    const title = typeof root.customData?.pt?.props?.title === "string" ? root.customData.pt.props.title : "";
    const sample = title || label;
    if (sample && estimateTextWidth(sample) + 24 > bbox.w) {
      warnings.push({ code: "TEXT_CLIP", message: `${id} text is wider than its box` });
    }
  }
  return warnings;
}

function cloneScene(session: PtDesignSession) {
  return structuredClone(session.getScene());
}

function runPlace(session: PtDesignSession, args: Record<string, unknown>) {
  const componentType = str(args, "componentType") ?? str(args, "type");
  if (!componentType) {
    throw new PtDesignError(PT_ERROR_CODES.USAGE, usageMessage("pt_place", "componentType is required"));
  }
  const { at, frameId } = resolvePlaceAt(session, args);
  const showcase = str(args, "mode") === "showcase";
  const requestedVariant = str(args, "variant");
  const variant = showcase ? undefined : (requestedVariant ?? defaultPlaceVariant(componentType));
  const props = (args.props as Record<string, string | number | boolean | null>) ?? undefined;
  const result = session.dispatch({
    type: "place",
    componentType,
    at,
    props,
    variant,
    size: str(args, "size"),
    frameId,
  });
  const instanceIds = result.instanceIds ?? (result.instanceId ? [result.instanceId] : []);
  const bbox = bboxFromRoot(instanceRoot(session, instanceIds[0] ?? ""));
  const warnings = placeWarnings({
    session,
    componentType,
    props: props as Record<string, unknown> | undefined,
    instanceIds,
    frameId,
  });
  return {
    ...result,
    componentType,
    bbox,
    warnings,
  };
}

/** Browser-safe tool runner. No filesystem. Used by the Atmos local HTTP bridge. */
export function runSessionTool(session: PtDesignSession, call: ToolCall): unknown {
  const { name, args } = call;
  switch (name) {
    case "pt_tools_list":
      return {
        tools: PT_DESIGN_TOOL_DEFS.map((def) => ({
          name: def.name,
          title: def.title,
          description: def.description,
          args: def.args,
          live: def.live !== false,
          readOnly: Boolean(def.readOnly),
        })),
        live: liveBoardToolNames(),
      };
    case "pt_catalog_list": {
      const kind = str(args, "kind");
      const items =
        kind === "basic" || kind === "block"
          ? session.listCatalog().filter((item) => item.kind === kind)
          : session.listCatalog();
      return { items, count: items.length, total: items.length, offset: 0, has_more: false };
    }
    case "pt_ir_get":
      return session.getIR({
        frameId: str(args, "frameId") ?? str(args, "frame"),
        instanceIds: Array.isArray(args.instanceIds) ? (args.instanceIds as string[]) : undefined,
      });
    case "pt_scene_get":
      return session.getScene();
    case "pt_place":
      return runPlace(session, args);
    case "pt_update": {
      const instanceId = str(args, "instanceId");
      if (!instanceId) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, usageMessage("pt_update", "instanceId is required"));
      }
      const frameId = str(args, "frameId") ?? str(args, "frame");
      return session.dispatch({
        type: "update",
        instanceId,
        props: (args.props as Record<string, string | number | boolean | null>) ?? undefined,
        variant: str(args, "variant"),
        size: str(args, "size"),
        bbox: parseBBox(args),
        frameId: frameId === undefined ? undefined : frameId,
      });
    }
    case "pt_delete": {
      const ids = instanceIdsArg(args);
      if (ids.length === 0) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, usageMessage("pt_delete", "instanceIds required"));
      }
      session.dispatch({ type: "delete", instanceIds: ids });
      return { deleted: ids };
    }
    case "pt_frame_create": {
      const presetName = str(args, "preset");
      const preset = presetName ? FRAME_PRESETS[presetName] : undefined;
      if (presetName && !preset) {
        throw new PtDesignError(
          PT_ERROR_CODES.USAGE,
          usageMessage("pt_frame_create", `Unknown preset: ${presetName}`),
        );
      }
      const w = hasOwn(args, "w") ? num(args, "w") : (preset?.w ?? 400);
      const h = hasOwn(args, "h") ? num(args, "h") : (preset?.h ?? 300);
      return session.dispatch({
        type: "createFrame",
        name: str(args, "name") ?? (presetName ? presetName[0]!.toUpperCase() + presetName.slice(1) : "Frame"),
        bbox: {
          x: num(args, "x"),
          y: num(args, "y"),
          w,
          h,
        },
      });
    }
    case "pt_frame_rename": {
      const frameId = str(args, "frameId") ?? str(args, "frame");
      const name = str(args, "name");
      if (!frameId || !name) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, usageMessage("pt_frame_rename", "frameId and name required"));
      }
      return session.dispatch({ type: "renameFrame", frameId, name });
    }
    case "pt_frame_update": {
      const frameId = str(args, "frameId") ?? str(args, "frame");
      if (!frameId) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, usageMessage("pt_frame_update", "frameId required"));
      }
      const bbox: Partial<BBox> = {};
      if (hasOwn(args, "x")) bbox.x = num(args, "x");
      if (hasOwn(args, "y")) bbox.y = num(args, "y");
      if (hasOwn(args, "w")) bbox.w = num(args, "w");
      if (hasOwn(args, "h")) bbox.h = num(args, "h");
      return session.dispatch({
        type: "updateFrame",
        frameId,
        name: str(args, "name"),
        bbox: Object.keys(bbox).length ? bbox : undefined,
      });
    }
    case "pt_frame_delete": {
      const frameId = str(args, "frameId") ?? str(args, "frame");
      if (!frameId) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, usageMessage("pt_frame_delete", "frameId required"));
      }
      return session.dispatch({ type: "deleteFrame", frameId, orphan: args.orphan === true });
    }
    case "pt_frames_list": {
      const ir = session.getIR();
      return { frames: ir.frames.map((f) => ({ id: f.id, name: f.name, bbox: f.bbox })) };
    }
    case "pt_layout_row":
      return layoutRow(session, instanceIdsArg(args), hasOwn(args, "gap") ? num(args, "gap") : 16, alignArg(args));
    case "pt_layout_column":
      return layoutColumn(session, instanceIdsArg(args), hasOwn(args, "gap") ? num(args, "gap") : 16, alignArg(args));
    case "pt_layout_grid":
      return layoutGrid(
        session,
        instanceIdsArg(args),
        num(args, "columns", 0),
        hasOwn(args, "gap") ? num(args, "gap") : 24,
        hasOwn(args, "rowGap") ? num(args, "rowGap") : undefined,
      );
    case "pt_lint":
      return lintDesignIR(session.getIR(), str(args, "frameId") ?? str(args, "frame"));
    case "pt_screenshot":
      throw new PtDesignError(
        PT_ERROR_CODES.USAGE,
        "pt_screenshot requires the open Prototype Design tab. POST /api/pt-design/agent/invoke.",
      );
    case "pt_batch": {
      const ops = args.ops;
      if (!Array.isArray(ops) || ops.length === 0) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, usageMessage("pt_batch", "ops must be a non-empty array"));
      }
      if (ops.length > 200) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, "pt_batch supports at most 200 ops");
      }
      const atomic = args.atomic !== false;
      const snapshot = atomic ? cloneScene(session) : null;
      const results: Array<{ ok: boolean; tool: string; data?: unknown; error?: { code: string; message: string } }> =
        [];
      for (const [index, op] of ops.entries()) {
        if (!op || typeof op !== "object") {
          results.push({
            ok: false,
            tool: "",
            error: { code: PT_ERROR_CODES.USAGE, message: `ops[${index}] must be { tool, args }` },
          });
          break;
        }
        const rec = op as Record<string, unknown>;
        const tool = typeof rec.tool === "string" ? rec.tool : "";
        if (!tool || tool === "pt_batch") {
          results.push({
            ok: false,
            tool,
            error: { code: PT_ERROR_CODES.USAGE, message: `ops[${index}] has an invalid tool` },
          });
          break;
        }
        try {
          const data = runSessionTool(session, {
            name: tool as ToolName,
            args: rec.args && typeof rec.args === "object" && !Array.isArray(rec.args)
              ? (rec.args as Record<string, unknown>)
              : {},
          });
          results.push({ ok: true, tool, data });
        } catch (error) {
          const code = error instanceof PtDesignError ? error.code : PT_ERROR_CODES.INTERNAL;
          const message = error instanceof Error ? error.message : String(error);
          results.push({ ok: false, tool, error: { code, message } });
          if (atomic) break;
        }
      }
      const failed = results.some((item) => !item.ok);
      if (failed && atomic && snapshot) {
        session.dispatch({ type: "replaceScene", scene: snapshot });
        return { results, rolledBack: true };
      }
      return { results, rolledBack: false };
    }
    case "pt_apply_ir": {
      if (args.dryRun === true) {
        return { dryRun: true, frames: (args.ir as DesignIR | undefined)?.frames?.length ?? 0 };
      }
      const ir = args.ir as DesignIR;
      if (!ir) throw new PtDesignError(PT_ERROR_CODES.USAGE, usageMessage("pt_apply_ir", "ir required"));
      const mode = args.mode === "replace" ? "replace" : "merge";
      session.dispatch({ type: "applyIR", ir, mode });
      return { ok: true, mode };
    }
    case "pt_export":
      return {
        ir: encodeDesignIR(session.getScene()),
        scene: session.getScene(),
        image: null,
      };
    case "pt_handoff":
      return session.buildHandoff({
        scope: (str(args, "scope") as "selection" | "frame" | "document" | undefined) ?? "document",
        frameId: str(args, "frameId") ?? str(args, "frame"),
        instanceIds: Array.isArray(args.instanceIds) ? (args.instanceIds as string[]) : undefined,
        prompt: str(args, "prompt"),
        includeImage: args.includeImage === true,
      });
    case "pt_doc_init":
    case "pt_doc_open":
    case "pt_doc_save":
      throw new PtDesignError(
        PT_ERROR_CODES.USAGE,
        "Live board tools do not use .ptdesign.json. Use Save/Open in the board, or catalog/ir/place on this open tab.",
      );
    default:
      throw new PtDesignError(PT_ERROR_CODES.USAGE, unknownToolMessage(name));
  }
}
