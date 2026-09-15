import { mkdirSync } from "node:fs";
import { createHeadlessSession, type HeadlessSession } from "../core/headless-session";
import { PtDesignError } from "../protocol";
import { isMutatingTool } from "./mutating";
import { runSessionTool, type ToolCall } from "./session-tools";

export { runSessionTool, type ToolCall } from "./session-tools";

export type FileSession = {
  path: string | null;
  autoSave: boolean;
  headless: HeadlessSession;
};

function isLegacyJson(file: string): boolean {
  return file.endsWith(".ptdesign.json");
}

function stripTrailingSlashes(file: string): string {
  let end = file.length;
  while (end > 0 && file.charCodeAt(end - 1) === 47) end -= 1;
  return file.slice(0, end);
}

function isPtdPath(file: string): boolean {
  const normalized = stripTrailingSlashes(file);
  return normalized.endsWith(".ptd") || normalized.endsWith("document.ptx");
}

function ptdDir(file: string): string {
  const normalized = stripTrailingSlashes(file);
  return normalized.endsWith("document.ptx")
    ? stripTrailingSlashes(normalized.slice(0, -"document.ptx".length)) || "."
    : normalized;
}

function rejectLegacyJson(file: string): void {
  if (isLegacyJson(file)) {
    throw new PtDesignError(
      "missing_file",
      "Agent API uses a .ptd directory (document.ptx), not .ptdesign.json.",
    );
  }
}

export function openFileSession(options: {
  file?: string;
  create?: boolean;
  autoSave?: boolean;
}): FileSession {
  const autoSave = options.autoSave ?? true;
  if (!options.file) {
    return { path: null, autoSave, headless: createHeadlessSession() };
  }
  rejectLegacyJson(options.file);
  const dir = isPtdPath(options.file) ? ptdDir(options.file) : options.file;
  const headless = createHeadlessSession();
  if (options.create) {
    mkdirSync(dir, { recursive: true });
    headless.saveDir(dir);
  } else {
    headless.openDir(dir);
  }
  return { path: dir, autoSave, headless };
}

function persist(fs: FileSession) {
  if (!fs.path || !fs.autoSave) return;
  fs.headless.saveDir(fs.path);
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

function docTarget(args: Record<string, unknown>, fs: FileSession): string | undefined {
  return str(args, "path") ?? str(args, "file") ?? fs.path ?? undefined;
}

function bindPtd(fs: FileSession, dir: string, headless: HeadlessSession) {
  fs.path = dir;
  fs.headless = headless;
}

export function runTool(fs: FileSession, call: ToolCall): unknown {
  const { name, args } = call;
  switch (name) {
    case "pt_ptx_get":
      return { ptx: fs.headless.getPtx() };
    case "pt_ptx_apply": {
      const ptx = str(args, "ptx");
      if (ptx === undefined) throw new PtDesignError("invalid_ptx", "ptx is required");
      fs.headless.applyPtx(ptx);
      persist(fs);
      return { ok: true };
    }
    case "pt_doc_init": {
      const file = docTarget(args, fs);
      if (!file) throw new PtDesignError("missing_file", "--file / path is required");
      rejectLegacyJson(file);
      const dir = isPtdPath(file) ? ptdDir(file) : file;
      mkdirSync(dir, { recursive: true });
      const headless = createHeadlessSession();
      headless.saveDir(dir);
      bindPtd(fs, dir, headless);
      return { ok: true };
    }
    case "pt_doc_open": {
      const file = docTarget(args, fs);
      if (!file) throw new PtDesignError("missing_file", "--file / path is required");
      rejectLegacyJson(file);
      const dir = isPtdPath(file) ? ptdDir(file) : file;
      const create = args.create === true;
      const next = openFileSession({ file: dir, create, autoSave: fs.autoSave });
      fs.path = next.path;
      fs.headless = next.headless;
      return { ptx: fs.headless.getPtx() };
    }
    case "pt_doc_save": {
      const file = docTarget(args, fs);
      if (!file) throw new PtDesignError("missing_file", "--file / path is required");
      rejectLegacyJson(file);
      const dir = isPtdPath(file) ? ptdDir(file) : file;
      mkdirSync(dir, { recursive: true });
      fs.headless.saveDir(dir);
      bindPtd(fs, dir, fs.headless);
      return { ok: true };
    }
    default: {
      const before = fs.headless.getPtx();
      try {
        const result = runSessionTool(fs.headless, call);
        if (isMutatingTool(name)) persist(fs);
        return result;
      } catch (error) {
        if (error instanceof PtDesignError && error.code === "unknown_tool") {
          if (fs.headless.getPtx() !== before) {
            fs.headless.applyPtx(before);
          }
        }
        throw error;
      }
    }
  }
}
