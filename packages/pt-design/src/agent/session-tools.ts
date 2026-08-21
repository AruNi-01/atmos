import { encodeDesignIR } from "../ir/encode";
import type { DesignIR } from "../ir/schema";
import type { PtDesignSession } from "../core/session";
import { PT_ERROR_CODES, PtDesignError } from "./errors";
import type { ToolName } from "./tool-defs";

export type ToolCall = {
  name: ToolName;
  args: Record<string, unknown>;
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

/** Browser-safe tool runner. No filesystem. Used by the Atmos local HTTP bridge. */
export function runSessionTool(session: PtDesignSession, call: ToolCall): unknown {
  const { name, args } = call;
  switch (name) {
    case "pt_catalog_list":
      return { items: session.listCatalog() };
    case "pt_ir_get":
      return session.getIR({
        frameId: str(args, "frameId") ?? str(args, "frame"),
        instanceIds: Array.isArray(args.instanceIds) ? (args.instanceIds as string[]) : undefined,
      });
    case "pt_scene_get":
      return session.getScene();
    case "pt_place": {
      const componentType = str(args, "componentType") ?? str(args, "type");
      if (!componentType) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, "componentType is required");
      }
      const at = point(args);
      const result = session.dispatch({
        type: "place",
        componentType,
        at,
        props: (args.props as Record<string, string | number | boolean | null>) ?? undefined,
        variant: str(args, "variant"),
        size: str(args, "size"),
        frameId: str(args, "frameId") ?? str(args, "frame"),
      });
      return { ...result, componentType };
    }
    case "pt_update": {
      const instanceId = str(args, "instanceId");
      if (!instanceId) throw new PtDesignError(PT_ERROR_CODES.USAGE, "instanceId is required");
      return session.dispatch({
        type: "update",
        instanceId,
        props: (args.props as Record<string, string | number | boolean | null>) ?? undefined,
        variant: str(args, "variant"),
        size: str(args, "size"),
      });
    }
    case "pt_delete": {
      const ids = Array.isArray(args.instanceIds)
        ? (args.instanceIds as string[])
        : str(args, "instanceId")
          ? [String(args.instanceId)]
          : [];
      if (ids.length === 0) throw new PtDesignError(PT_ERROR_CODES.USAGE, "instanceIds required");
      session.dispatch({ type: "delete", instanceIds: ids });
      return { deleted: ids };
    }
    case "pt_frame_create":
      return session.dispatch({
        type: "createFrame",
        name: str(args, "name") ?? "Frame",
        bbox: {
          x: num(args, "x"),
          y: num(args, "y"),
          w: num(args, "w", 400),
          h: num(args, "h", 300),
        },
      });
    case "pt_frame_rename": {
      const frameId = str(args, "frameId") ?? str(args, "frame");
      const name = str(args, "name");
      if (!frameId || !name) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, "frameId and name required");
      }
      return session.dispatch({ type: "renameFrame", frameId, name });
    }
    case "pt_frames_list": {
      const ir = session.getIR();
      return { frames: ir.frames.map((f) => ({ id: f.id, name: f.name, bbox: f.bbox })) };
    }
    case "pt_apply_ir": {
      if (args.dryRun === true) {
        return { dryRun: true, frames: (args.ir as DesignIR | undefined)?.frames?.length ?? 0 };
      }
      const ir = args.ir as DesignIR;
      if (!ir) throw new PtDesignError(PT_ERROR_CODES.USAGE, "ir required");
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
      throw new PtDesignError(PT_ERROR_CODES.USAGE, `Unknown tool: ${name}`);
  }
}
