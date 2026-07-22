"use client";

import { wsRequest } from "@/api/ws/request";

export interface DiskNode {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  is_project: boolean;
  file_count: number;
  dir_count: number;
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
  status: "running" | "completed" | "cancelled" | "failed";
  files_scanned: number;
  bytes_scanned: number;
  dirs_scanned?: number;
  error_count?: number;
  current_path?: string | null;
  percent?: number | null;
  error?: string | null;
  tree?: DiskNode;
  stats?: DiskScanStats;
  suggestions?: CleanupSuggestion[];
}

export interface CleanupSuggestion {
  path: string;
  name: string;
  size: number;
  reason: string;
}

export interface DiskVolumeInfo {
  path: string;
  total_bytes: number;
  available_bytes: number;
}

export const diskAnalyzerApi = {
  startScan: async (path?: string, maxChildren?: number) => {
    return wsRequest<{ scan_id: string; root_path: string; status: string }>(
      "disk_analyzer_start_scan",
      {
        path: path ?? null,
        max_children: maxChildren ?? 40,
      },
      30_000,
    );
  },
  cancelScan: async (scanId: string) => {
    return wsRequest<{ ok: boolean }>("disk_analyzer_cancel_scan", {
      scan_id: scanId,
    });
  },
  getTree: async (scanId: string, path?: string, maxChildren?: number) => {
    return wsRequest<{ tree: DiskNode; stats: DiskScanStats | null }>(
      "disk_analyzer_get_tree",
      {
        scan_id: scanId,
        path: path ?? null,
        max_children: maxChildren ?? null,
      },
    );
  },
  deletePath: async (scanId: string, path: string, permanent = false) => {
    return wsRequest<{
      success: boolean;
      path: string;
      freed_bytes: number;
      permanent: boolean;
    }>("disk_analyzer_delete", { scan_id: scanId, path, permanent });
  },
  diskInfo: async (path?: string) => {
    return wsRequest<DiskVolumeInfo>("disk_analyzer_disk_info", {
      path: path ?? null,
    });
  },
};
