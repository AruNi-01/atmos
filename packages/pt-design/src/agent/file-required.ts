import type { FileSession } from "./api";
import { PtDesignError } from "../protocol";

const FILE_OPTIONAL = new Set(["pt_catalog_list", "pt_tools_list", "pt_doc_init", "pt_doc_open", "pt_screenshot"]);

export const OFFLINE_FILE_REQUIRED_MESSAGE =
  "Pass --file for an offline .ptd (document.ptx). To edit the open Prototype Design tab, POST /api/pt-design/agent/invoke. Do not join a collaboration room.";

export function toolRequiresOfflineFile(name: string): boolean {
  return !FILE_OPTIONAL.has(name);
}

export function requireOfflineFile(fs: FileSession, name: string): void {
  if (!toolRequiresOfflineFile(name) || fs.path) return;
  throw new PtDesignError("missing_file", OFFLINE_FILE_REQUIRED_MESSAGE);
}
