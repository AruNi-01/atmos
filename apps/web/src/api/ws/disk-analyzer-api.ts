"use client";

import { wsRequest } from "@/api/ws/request";

export interface DiskNode {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  /** Identified Atmos project root (not a workspace worktree). */
  is_project: boolean;
  /** Identified Atmos workspace worktree. */
  is_workspace?: boolean;
  /** Linked git worktree that is not an Atmos workspace. */
  is_git_worktree?: boolean;
  /** Mainstream code-agent session / transcript directory. */
  is_agent_data?: boolean;
  file_count: number;
  dir_count: number;
  /** When false, directory children are not loaded yet — load on drill-in. */
  children_loaded?: boolean;
  children?: DiskNode[];
}

export interface DiskScanStats {
  root_path: string;
  total_size: number;
  files_scanned: number;
  dirs_scanned: number;
  error_count: number;
  elapsed_ms: number;
}

export interface DiskScanProgress {
  scan_id: string;
  status: "running" | "completed" | "cancelled" | "failed" | "level_completed";
  files_scanned: number;
  bytes_scanned: number;
  dirs_scanned?: number;
  error_count?: number;
  current_path?: string | null;
  percent?: number | null;
  error?: string | null;
  tree?: DiskNode;
  level_path?: string | null;
  stats?: DiskScanStats;
  suggestions?: CleanupSuggestion[] | null;
}

export type CleanupKind = "cache" | "worktree" | "session" | "workspace";

export interface CleanupSuggestion {
  path: string;
  name: string;
  size: number;
  reason: string;
  kind?: CleanupKind;
  last_activity_ms?: number | null;
}

export interface DiskSuggestionsResponse {
  suggestions: CleanupSuggestion[];
  ready: boolean;
}

export interface DiskVolumeInfo {
  path: string;
  total_bytes: number;
  available_bytes: number;
}

export type DiskTreeResponse =
  | { status: "ready"; tree: DiskNode; stats: DiskScanStats | null }
  | { status: "loading"; path: string; stats: null };

export const diskAnalyzerApi = {
  /**
   * @param path Optional explicit root. When omitted, server uses Atmos-scoped paths
   *             unless `scanAll` is true (home + Applications).
   */
  startScan: async (path?: string, maxChildren?: number, scanAll = false) => {
    // start_scan must return immediately (session id only). Keep a short timeout so
    // hangs surface quickly instead of looking like a long disk walk.
    return wsRequest("disk_analyzer_start_scan",
      {
        path: path ?? null,
        max_children: maxChildren ?? 30,
        scan_all: scanAll,
      },
      15_000,
    );
  },
  cancelScan: async (scanId: string) => {
    return wsRequest("disk_analyzer_cancel_scan", {
      scan_id: scanId,
    });
  },
  getTree: async (scanId: string, path?: string, maxChildren?: number) => {
    return wsRequest("disk_analyzer_get_tree", {
      scan_id: scanId,
      path: path ?? null,
      max_children: maxChildren ?? null,
    });
  },
  getSuggestions: async (scanId: string) => {
    return wsRequest("disk_analyzer_get_suggestions", {
      scan_id: scanId,
    });
  },
  deletePath: async (scanId: string, path: string, permanent = false) => {
    return wsRequest("disk_analyzer_delete", { scan_id: scanId, path, permanent });
  },
  diskInfo: async (path?: string) => {
    return wsRequest("disk_analyzer_disk_info", {
      path: path ?? null,
    });
  },
};
