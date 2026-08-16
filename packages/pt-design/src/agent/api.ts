import { writeFileSync } from "node:fs";
import {
  initDesignDocument,
  openDesignDocument,
  saveDesignDocument,
  type PtDesignFile,
} from "../core/document";
import { createPtDesignSession, type PtDesignSession } from "../core/session";
import { encodeDesignIR } from "../ir/encode";
import type { DesignIR } from "../ir/schema";
import { PT_ERROR_CODES, PtDesignError } from "./errors";
import type { ToolName } from "./tool-defs";

export type ToolCall = {
  name: ToolName;
  args: Record<string, unknown>;
};

export type FileSession = {
  path: string | null;
  autoSave: boolean;
  doc: PtDesignFile;
  session: PtDesignSession;
};

export function openFileSession(options: {
  file?: string;
  create?: boolean;
  autoSave?: boolean;
}): FileSession {
  const autoSave = options.autoSave ?? true;
  if (!options.file) {
    const session = createPtDesignSession();
    return {
      path: null,
      autoSave: false,
      doc: {
        format: "pt-design-file/1",
        revision: 0,
        catalogVersion: "memory",
        excalidrawCompat: "0.18",
        scene: session.getScene(),
      },
      session,
    };
  }
  const doc = options.create
    ? initDesignDocument(options.file)
    : openDesignDocument(options.file);
  return {
    path: options.file,
    autoSave,
    doc,
    session: createPtDesignSession(doc.scene),
  };
}

function persist(fs: FileSession) {
  if (!fs.path || !fs.autoSave) return;
  fs.doc = saveDesignDocument(fs.path, {
    ...fs.doc,
    scene: fs.session.getScene(),
  });
}

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

export function runTool(fs: FileSession, call: ToolCall): unknown {
  const { name, args } = call;
  switch (name) {
    case "pt_catalog_list":
      return { items: fs.session.listCatalog() };
    case "pt_ir_get":
      return fs.session.getIR({
        frameId: str(args, "frameId") ?? str(args, "frame"),
        instanceIds: Array.isArray(args.instanceIds) ? (args.instanceIds as string[]) : undefined,
      });
    case "pt_scene_get":
      return fs.session.getScene();
    case "pt_place": {
      const componentType = str(args, "componentType") ?? str(args, "type");
      if (!componentType) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, "componentType is required");
      }
      const at = point(args);
      const result = fs.session.dispatch({
        type: "place",
        componentType,
        at,
        props: (args.props as Record<string, string | number | boolean | null>) ?? undefined,
        variant: str(args, "variant"),
        size: str(args, "size"),
        frameId: str(args, "frameId") ?? str(args, "frame"),
      });
      persist(fs);
      return { ...result, componentType };
    }
    case "pt_update": {
      const instanceId = str(args, "instanceId");
      if (!instanceId) throw new PtDesignError(PT_ERROR_CODES.USAGE, "instanceId is required");
      const result = fs.session.dispatch({
        type: "update",
        instanceId,
        props: (args.props as Record<string, string | number | boolean | null>) ?? undefined,
        variant: str(args, "variant"),
        size: str(args, "size"),
      });
      persist(fs);
      return result;
    }
    case "pt_delete": {
      const ids = Array.isArray(args.instanceIds)
        ? (args.instanceIds as string[])
        : str(args, "instanceId")
          ? [String(args.instanceId)]
          : [];
      if (ids.length === 0) throw new PtDesignError(PT_ERROR_CODES.USAGE, "instanceIds required");
      fs.session.dispatch({ type: "delete", instanceIds: ids });
      persist(fs);
      return { deleted: ids };
    }
    case "pt_frame_create": {
      const result = fs.session.dispatch({
        type: "createFrame",
        name: str(args, "name") ?? "Frame",
        bbox: {
          x: num(args, "x"),
          y: num(args, "y"),
          w: num(args, "w", 400),
          h: num(args, "h", 300),
        },
      });
      persist(fs);
      return result;
    }
    case "pt_frame_rename": {
      const frameId = str(args, "frameId") ?? str(args, "frame");
      const name = str(args, "name");
      if (!frameId || !name) {
        throw new PtDesignError(PT_ERROR_CODES.USAGE, "frameId and name required");
      }
      const result = fs.session.dispatch({ type: "renameFrame", frameId, name });
      persist(fs);
      return result;
    }
    case "pt_frames_list": {
      const ir = fs.session.getIR();
      return { frames: ir.frames.map((f) => ({ id: f.id, name: f.name, bbox: f.bbox })) };
    }
    case "pt_apply_ir": {
      if (args.dryRun === true) {
        return { dryRun: true, frames: (args.ir as DesignIR | undefined)?.frames?.length ?? 0 };
      }
      const ir = args.ir as DesignIR;
      if (!ir) throw new PtDesignError(PT_ERROR_CODES.USAGE, "ir required");
      const mode = args.mode === "replace" ? "replace" : "merge";
      fs.session.dispatch({ type: "applyIR", ir, mode });
      persist(fs);
      return { ok: true, mode };
    }
    case "pt_export":
      return {
        ir: encodeDesignIR(fs.session.getScene()),
        scene: fs.session.getScene(),
        image: null,
      };
    case "pt_handoff": {
      const scope =
        (str(args, "scope") as "selection" | "frame" | "document" | undefined) ?? "document";
      const payload = fs.session.buildHandoff({
        scope,
        frameId: str(args, "frameId") ?? str(args, "frame"),
        instanceIds: Array.isArray(args.instanceIds) ? (args.instanceIds as string[]) : undefined,
        prompt: str(args, "prompt"),
        includeImage: args.includeImage === true,
      });
      const out = str(args, "out");
      if (out) writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
      return payload;
    }
    case "pt_doc_init": {
      const file = str(args, "file") ?? fs.path;
      if (!file) throw new PtDesignError(PT_ERROR_CODES.USAGE, "--file is required");
      const doc = initDesignDocument(file);
      fs.path = file;
      fs.doc = doc;
      fs.session.dispatch({ type: "replaceScene", scene: doc.scene });
      return { file, revision: doc.revision };
    }
    case "pt_doc_open": {
      const file = str(args, "file") ?? fs.path;
      if (!file) throw new PtDesignError(PT_ERROR_CODES.USAGE, "--file is required");
      const create = args.create === true;
      const next = openFileSession({ file, create, autoSave: fs.autoSave });
      fs.path = next.path;
      fs.doc = next.doc;
      fs.session.dispatch({ type: "replaceScene", scene: next.doc.scene });
      return { file, revision: next.doc.revision };
    }
    case "pt_doc_save": {
      if (!fs.path) throw new PtDesignError(PT_ERROR_CODES.USAGE, "--file is required");
      fs.doc = saveDesignDocument(fs.path, {
        ...fs.doc,
        scene: fs.session.getScene(),
      });
      return { file: fs.path, revision: fs.doc.revision };
    }
    default:
      throw new PtDesignError(PT_ERROR_CODES.USAGE, `Unknown tool: ${name}`);
  }
}
