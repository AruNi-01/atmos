import type { FileSession } from "./api";
import { PT_ERROR_CODES, PtDesignError } from "./errors";

const FILE_OPTIONAL = new Set(["pt_catalog_list", "pt_tools_list", "pt_doc_init", "pt_doc_open"]);

export const OFFLINE_FILE_REQUIRED_MESSAGE =
  "Pass --file for an offline .ptdesign.json. To edit the open Prototype Design tab, POST /api/pt-design/agent/invoke. Do not join a collaboration room.";

export function toolRequiresOfflineFile(name: string): boolean {
  return !FILE_OPTIONAL.has(name);
}

export function requireOfflineFile(fs: FileSession, name: string): void {
  if (!toolRequiresOfflineFile(name) || fs.path) return;
  throw new PtDesignError(PT_ERROR_CODES.MISSING_FILE, OFFLINE_FILE_REQUIRED_MESSAGE);
}
