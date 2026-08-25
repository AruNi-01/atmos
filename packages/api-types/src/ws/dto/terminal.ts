export type TerminalWorkspaceCandidatesRequest = {
  workspace_id: string;
  project_name?: string | null;
  workspace_name?: string | null;
};

export type TerminalWorkspaceCandidate = {
  id: string;
  workspace_id: string;
  label: string;
  session_id?: string | null;
  tmux_session?: string | null;
  tmux_window_name?: string | null;
  tmux_window_index?: number | null;
  session_type?: string | null;
  project_name?: string | null;
  workspace_name?: string | null;
  terminal_name?: string | null;
  cwd?: string | null;
  terminal_kind?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  source_tmux_window_name?: string | null;
  active: boolean;
};

export type TerminalWorkspaceCandidatesResponse = {
  candidates: TerminalWorkspaceCandidate[];
};

export type TerminalSessionCreateRequest = {
  workspace_id: string;
  session_id?: string | null;
  shell?: string | null;
  name?: string | null;
  cwd?: string | null;
  project_name?: string | null;
  workspace_name?: string | null;
  cols?: number | null;
  rows?: number | null;
  detach_after_create?: boolean;
};

export type TerminalSessionCreateResponse = {
  session_id: string;
  workspace_id: string;
  detached: boolean;
};

export type TerminalSessionListRequest = {
  workspace_id?: string | null;
};

export type TerminalSessionType = "tmux" | "simple";

export type TerminalKind = "standard" | "side_chat";

export type TerminalSessionDetail = {
  session_id: string;
  workspace_id: string;
  session_type: TerminalSessionType;
  project_name: string | null;
  workspace_name: string | null;
  terminal_name: string | null;
  tmux_session: string | null;
  tmux_window_index: number | null;
  cwd: string | null;
  terminal_kind: TerminalKind;
  side_chat_id: string | null;
  source_pane_id: string | null;
  source_tmux_window_name: string | null;
  uptime_secs: number;
};

export type TerminalSessionListResponse = {
  sessions: TerminalSessionDetail[];
};

export type TerminalSessionCloseRequest = {
  session_id: string;
};

export type TerminalSessionDestroyRequest = {
  session_id: string;
};

export type TerminalSessionCloseResponse = {
  success: boolean;
  session_id: string;
};

export type RunLogStartRequest = {
  project_root: string;
  window_name: string;
  command?: string | null;
};

export type RunLogStartResponse = {
  latest_path: string;
};

export type RunLogResolveLatestRequest = {
  project_root: string;
};

export type RunLogResolveLatestResponse = {
  latest_path?: string | null;
};

export type TerminalSideContextCaptureRequest = {
  workspace_id: string;
  project_name?: string | null;
  workspace_name?: string | null;
  source_session_id?: string | null;
  source_tmux_window_name: string;
  max_prompt_bytes?: number | null;
};

export type TerminalSideContextCaptureResponse = {
  workspace_id: string;
  project_name?: string | null;
  workspace_name?: string | null;
  tmux_window_name: string;
  tmux_window_index: number;
  captured_lines: number;
  captured_bytes: number;
  prompt_budget_bytes: number;
  omitted_older_bytes: number;
  omitted_middle_bytes: number;
  truncated_bytes: boolean;
  text: string;
};

export type TerminalSideChatStatus = "open" | "hidden" | "closing";

export type TerminalSideChatRecord = {
  side_chat_id: string;
  workspace_id: string;
  project_name?: string | null;
  workspace_name?: string | null;
  source_pane_id: string;
  source_tmux_window_name: string;
  source_surface_kind: string;
  source_surface_ref_json?: string | null;
  side_tmux_window_name: string;
  agent_ref_json?: string | null;
  color_hex: string;
  status: TerminalSideChatStatus;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TerminalSideChatListRequest = {
  workspace_id: string;
};

export type TerminalSideChatListResponse = {
  workspace_id: string;
  records: TerminalSideChatRecord[];
};

export type TerminalSideChatUpsertRequest = {
  record: TerminalSideChatRecord;
};

export type TerminalSideChatStatusRequest = {
  workspace_id: string;
  side_chat_id: string;
  status: "open" | "hidden" | TerminalSideChatStatus;
};

export type TerminalSideChatCloseRequest = {
  workspace_id: string;
  side_chat_id: string;
};

export type TerminalSideChatCloseResponse = {
  ok: boolean;
  closed: boolean;
};
