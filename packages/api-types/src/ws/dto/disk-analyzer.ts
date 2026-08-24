export type DiskNode = {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  is_project: boolean;
  is_workspace?: boolean;
  is_git_worktree?: boolean;
  is_agent_data?: boolean;
  file_count: number;
  dir_count: number;
  children_loaded?: boolean;
  children?: DiskNode[];
};

export type DiskScanStats = {
  root_path: string;
  total_size: number;
  files_scanned: number;
  dirs_scanned: number;
  error_count: number;
  elapsed_ms: number;
};

export type CleanupKind = "cache" | "worktree" | "session" | "workspace";

export type CleanupSuggestion = {
  path: string;
  name: string;
  size: number;
  reason: string;
  kind?: CleanupKind;
  last_activity_ms?: number | null;
};

export type DiskScanProgress = {
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
};

export type DiskSuggestionsResponse = {
  suggestions: CleanupSuggestion[];
  ready: boolean;
};

export type DiskVolumeInfo = {
  path: string;
  total_bytes: number;
  available_bytes: number;
};

export type DiskTreeResponse =
  | { status: "ready"; tree: DiskNode; stats: DiskScanStats | null }
  | { status: "loading"; path: string; stats: null };

export type DiskAnalyzerStartScanRequest = {
  path?: string | null;
  max_children?: number | null;
  scan_all?: boolean | null;
};

export type DiskAnalyzerStartScanResponse = {
  scan_id: string;
  root_path: string;
  status: string;
  scan_all?: boolean;
};

export type DiskAnalyzerCancelScanRequest = {
  scan_id: string;
};

export type DiskAnalyzerGetTreeRequest = {
  scan_id: string;
  path?: string | null;
  max_children?: number | null;
};

export type DiskAnalyzerGetSuggestionsRequest = {
  scan_id: string;
};

export type DiskAnalyzerDeleteRequest = {
  scan_id: string;
  path: string;
  permanent?: boolean;
};

export type DiskAnalyzerDeleteResponse = {
  success: boolean;
  path: string;
  freed_bytes: number;
  permanent: boolean;
};

export type DiskAnalyzerDiskInfoRequest = {
  path?: string | null;
};
