'use client';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import {
  getLoopbackHttpBase,
  getRuntimeApiConfig,
  httpBase,
  wsBase,
} from '@/shared/lib/desktop-runtime';

/**
 * REST API client for endpoints that need to be called before WebSocket connection
 * or when WebSocket is not available.
 */

/** WebSocket base URL for agent chat (ws/wss derived from API base) */
export const getAgentWsBase = async (): Promise<string> => {
  const cfg = await getRuntimeApiConfig();
  return wsBase(cfg);
};

async function resolveHttpFetchTarget(): Promise<{ apiBase: string; bearer?: string }> {
  const computer = useAtmosComputerStore.getState();
  if (computer.connectionMode === 'relay' && computer.relayGatewayHttpBase) {
    return {
      apiBase: computer.relayGatewayHttpBase.replace(/\/$/, ''),
      bearer: computer.relayClientToken ?? undefined,
    };
  }
  const apiBase = await getLoopbackHttpBase();
  const cfg = await getRuntimeApiConfig();
  return { apiBase, bearer: cfg.token };
}

export const getRuntimeHttpBase = async (): Promise<string> => {
  const { apiBase } = await resolveHttpFetchTarget();
  return apiBase;
};

// ===== Types =====

export interface TmuxStatusResponse {
  installed: boolean;
  version: string | null;
}

export interface GhCliStatusResponse {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  username: string | null;
}

export interface GitStatusResponse {
  installed: boolean;
  version: string | null;
  username: string | null;
  email: string | null;
}

export interface TerminalAgentCliStatusItem {
  agent_id: string;
  label: string;
  cmd: string;
  installed: boolean;
}

export interface TerminalAgentsStatusResponse {
  agents: TerminalAgentCliStatusItem[];
}

export interface TmuxInstallPlanResponse {
  installed: boolean;
  supported: boolean;
  platform: string;
  package_manager: string | null;
  package_manager_label: string | null;
  command: string | null;
  requires_sudo: boolean;
  reason: string | null;
}

export interface CliVersionCheckResponse {
  installed: boolean;
  current_version: string | null;
  latest_version: string | null;
  latest_tag: string | null;
  release_url: string | null;
  update_available: boolean;
  install_path: string | null;
}

export interface CliInstallResponse {
  success: boolean;
  version: string | null;
  message: string;
  path_modified: boolean | null;
  path_modified_file: string | null;
}

export interface TmuxSession {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

export interface TmuxWindow {
  index: number;
  name: string;
  current_command?: string | null;
}

export interface AtmosCanvasScript {
  entry: string;
  files: Record<string, string>;
}

export interface AtmosCanvasFile {
  schema: string;
  title: string;
  tldrawDocument?: unknown | null;
  session?: unknown | null;
  script?: AtmosCanvasScript | null;
}

export interface CanvasDocumentListItem {
  file_name: string;
  title: string;
  modified_at: string;
  size_bytes: number;
}

export interface CanvasDocumentListResponse {
  dir: string;
  items: CanvasDocumentListItem[];
}

export interface CanvasDocumentFileResponse {
  file_name: string;
  title: string;
  modified_at: string;
  size_bytes: number;
  absolute_path?: string | null;
  body: AtmosCanvasFile;
}

export interface CanvasDocumentWriteResponse {
  item: CanvasDocumentListItem;
}

// ===== API Response wrapper =====

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const { apiBase, bearer } = await resolveHttpFetchTarget();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.error || body.message || JSON.stringify(body);
    } catch {
      // response body not JSON
    }
    throw new Error(
      `API error: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`
    );
  }

  const result: ApiResponse<T> = await response.json();

  if (!result.success) {
    throw new Error(result.message || 'API request failed');
  }

  return result.data;
}

async function fetchHooksApi<T>(path: string, options?: RequestInit): Promise<T> {
  const { apiBase, bearer } = await resolveHttpFetchTarget();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...options?.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.error || body?.message || response.statusText;
    throw new Error(
      `API error: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`
    );
  }

  return body as T;
}

// ===== Terminal Overview Types =====

export type SessionType = 'tmux' | 'simple';
export type TerminalContextScope = 'workspace' | 'project';

export interface ActiveSessionInfo {
  session_id: string;
  workspace_id: string;
  context_scope: TerminalContextScope;
  session_type: SessionType;
  project_name: string | null;
  workspace_name: string | null;
  terminal_name: string | null;
  tmux_session: string | null;
  tmux_window_index: number | null;
  tmux_window_name: string | null;
  cwd: string | null;
  uptime_secs: number;
}

export interface TmuxWindowDetail {
  index: number;
  name: string;
  active: boolean;
}

export interface TmuxSessionDetail {
  name: string;
  windows: number;
  window_list: TmuxWindowDetail[];
  created: string;
  attached: boolean;
}

export interface PtyProcessInfo {
  command: string;
  count: number;
}

export type PtyHealth = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface SystemPtyInfo {
  os: string;
  pty_max: number | null;
  pty_current: number | null;
  usage_percent: number | null;
  health: PtyHealth;
  top_processes: PtyProcessInfo[];
}

export interface OrphanedProcess {
  pid: number;
  command: string;
  elapsed: string;
}

export interface TmuxServerInfo {
  socket_path: string;
  server_pid: number | null;
  uptime_secs: number | null;
  total_sessions: number;
  total_windows: number;
  running: boolean;
}


export interface ShellEnvInfo {
  shell: string;
  term: string;
  user: string;
  home: string;
  os: string;
  arch: string;
  os_version: string | null;
  hostname: string | null;
}

export interface PtyDeviceProcess {
  command: string;
  pid: string;
  user: string;
  fd: string;
}

export interface PtyDeviceDetail {
  device: string;
  process_count: number;
  processes: PtyDeviceProcess[];
}

export interface RegistrationMetaResponse {
  via: string;
  version?: string;
}

export interface RuntimeInfoResponse {
  api_version: string;
  app_device_id?: string | null;
  registration_meta?: RegistrationMetaResponse | Record<string, unknown> | null;
  runtime_manifest: {
    source: string;
    started_at: string;
    api_url: string;
    api_port: number;
    ws_url: string;
    pid?: number | null;
  } | null;
  relay: {
    registered: boolean;
    server_id: string | null;
    relay_url: string | null;
    connected: boolean;
  };
}

export interface TerminalOverviewResponse {
  active_sessions: ActiveSessionInfo[];
  active_session_count: number;
  tmux: {
    installed: boolean;
    version: string | null;
    sessions: TmuxSessionDetail[];
    session_count: number;
    stale_client_sessions: number;
  };
  tmux_server: TmuxServerInfo;
  system_pty: SystemPtyInfo;
  orphaned_processes: OrphanedProcess[];
  orphaned_process_count: number;
  ws_connection_count: number;
  shell_env: ShellEnvInfo;
  pty_devices: PtyDeviceDetail[];
}

export interface CleanupResponse {
  cleaned_client_sessions: number;
  remaining_client_sessions: number;
}

export interface WsConnectionInfo {
  id: string;
  client_type: string;
  idle_secs: number;
}

// ===== System API =====

export const systemApi = {
  /**
   * Lightweight health check for local sidecar/web availability.
   */
  checkHealth: async (): Promise<boolean> => {
    const cfg = await getRuntimeApiConfig();
    const response = await fetch(`${httpBase(cfg)}/healthz`, {
      headers: cfg.token
        ? {
            Authorization: `Bearer ${cfg.token}`,
          }
        : undefined,
    });
    return response.ok;
  },

  /**
   * Check tmux installation status
   */
  getTmuxStatus: async (): Promise<TmuxStatusResponse> => {
    return fetchApi<TmuxStatusResponse>('/api/system/tmux-status');
  },

  /**
   * Check GitHub CLI installation and authentication status.
   */
  getGhCliStatus: async (): Promise<GhCliStatusResponse> => {
    return fetchApi<GhCliStatusResponse>('/api/system/gh-cli-status');
  },

  /**
   * Check Git installation status and user settings.
   */
  getGitStatus: async (): Promise<GitStatusResponse> => {
    return fetchApi<GitStatusResponse>('/api/system/git-status');
  },

  /**
   * Detect which built-in terminal agent CLIs are installed on the API host.
   */
  getTerminalAgentsStatus: async (): Promise<TerminalAgentsStatusResponse> => {
    return fetchApi<TerminalAgentsStatusResponse>('/api/system/terminal-agents-status');
  },

  /**
   * Detect the best tmux installation command for the current API host.
   */
  getTmuxInstallPlan: async (): Promise<TmuxInstallPlanResponse> => {
    return fetchApi<TmuxInstallPlanResponse>('/api/system/tmux-install-plan');
  },

  /**
   * Check installed Atmos CLI version against the latest GitHub CLI release.
   */
  checkCliVersion: async (): Promise<CliVersionCheckResponse> => {
    return fetchApi<CliVersionCheckResponse>('/api/system/cli-version-check');
  },

  /**
   * Download and install the latest Atmos CLI from GitHub releases.
   */
  installCli: async (modifyPath: boolean = false): Promise<CliInstallResponse> => {
    return fetchApi<CliInstallResponse>('/api/system/cli-install', {
      method: 'POST',
      body: JSON.stringify({ modify_path: modifyPath }),
    });
  },

  /**
   * List all Atmos tmux sessions
   */
  listTmuxSessions: async (): Promise<{ sessions: TmuxSession[] }> => {
    return fetchApi<{ sessions: TmuxSession[] }>('/api/system/tmux-sessions');
  },

  /**
   * List tmux windows for a workspace
   */
  listTmuxWindows: async (workspaceId: string): Promise<{ windows: TmuxWindow[] }> => {
    return fetchApi<{ windows: TmuxWindow[] }>(`/api/system/tmux-windows/${workspaceId}`);
  },

  /**
   * Kill a tmux window for a workspace by window name.
   */
  killTmuxWindow: async (
    workspaceId: string,
    tmuxWindowName: string,
  ): Promise<{ killed: boolean; message?: string }> => {
    return fetchApi<{ killed: boolean; message?: string }>(`/api/system/tmux-window/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify({ tmux_window_name: tmuxWindowName }),
    });
  },

  captureTmuxWindow: async (
    workspaceId: string,
    params: {
      tmux_window_name: string;
      max_lines?: number;
      /** Lines already read from the bottom (0 = newest page). */
      skip_lines?: number;
      project_name?: string;
      workspace_name?: string;
    },
  ): Promise<{
    tmux_window_name: string;
    data: string;
    rows: number;
    cols: number;
    alternate?: boolean;
    skip_lines?: number;
    lines_returned?: number;
    has_more_older?: boolean;
    next_skip_lines?: number | null;
  }> => {
    const search = new URLSearchParams();
    search.set("tmux_window_name", params.tmux_window_name);
    if (params.max_lines != null) {
      search.set("max_lines", String(params.max_lines));
    }
    if (params.skip_lines != null && params.skip_lines > 0) {
      search.set("skip_lines", String(params.skip_lines));
    }
    if (params.project_name) {
      search.set("project_name", params.project_name);
    }
    if (params.workspace_name) {
      search.set("workspace_name", params.workspace_name);
    }
    return fetchApi(`/api/system/tmux-capture/${workspaceId}?${search.toString()}`);
  },

  /**
   * Get comprehensive terminal overview for Terminal Manager
   */
  getTerminalOverview: async (): Promise<TerminalOverviewResponse> => {
    return fetchApi<TerminalOverviewResponse>('/api/system/terminal-overview');
  },

  getRuntimeInfo: async (): Promise<RuntimeInfoResponse> => {
    return fetchApi<RuntimeInfoResponse>('/api/system/runtime-info');
  },

  /**
   * Clean up stale terminal resources
   */
  cleanupTerminals: async (): Promise<CleanupResponse> => {
    return fetchApi<CleanupResponse>('/api/system/terminal-cleanup', {
      method: 'POST',
    });
  },

  /**
   * Kill the entire tmux server
   */
  killTmuxServer: async (): Promise<{ killed: boolean }> => {
    return fetchApi<{ killed: boolean }>('/api/system/tmux-kill-server', {
      method: 'POST',
    });
  },

  /**
   * Check if Project Wiki tmux window exists for a workspace
   */
  checkProjectWikiWindow: async (workspaceId: string): Promise<{ exists: boolean }> => {
    return fetchApi<{ exists: boolean }>(`/api/system/project-wiki-window/${workspaceId}`);
  },

  /**
   * Kill the Project Wiki tmux window for a workspace
   */
  killProjectWikiWindow: async (workspaceId: string): Promise<{ killed: boolean; message?: string }> => {
    return fetchApi<{ killed: boolean; message?: string }>(`/api/system/project-wiki-window/${workspaceId}`, {
      method: 'POST',
    });
  },

  /**
   * Check if Code Review tmux window exists for a workspace
   */
  checkCodeReviewWindow: async (workspaceId: string): Promise<{ exists: boolean }> => {
    return fetchApi<{ exists: boolean }>(`/api/system/code-review-window/${workspaceId}`);
  },

  /**
   * Kill the Code Review tmux window for a workspace
   */
  killCodeReviewWindow: async (workspaceId: string): Promise<{ killed: boolean; message?: string }> => {
    return fetchApi<{ killed: boolean; message?: string }>(`/api/system/code-review-window/${workspaceId}`, {
      method: 'POST',
    });
  },

  /**
   * Kill a specific tmux session
   */
  killTmuxSession: async (sessionName: string): Promise<{ killed: boolean; session_name?: string; error?: string }> => {
    return fetchApi<{ killed: boolean; session_name?: string; error?: string }>('/api/system/tmux-kill-session', {
      method: 'POST',
      body: JSON.stringify({ session_name: sessionName }),
    });
  },

  /**
   * Kill all orphaned processes by their PIDs
   */
  killOrphanedProcesses: async (pids: number[]): Promise<{ killed: number; total: number; failed_pids: number[] }> => {
    return fetchApi<{ killed: number; total: number; failed_pids: number[] }>('/api/system/kill-orphaned-processes', {
      method: 'POST',
      body: JSON.stringify({ pids }),
    });
  },

  getWsConnections: async (): Promise<{ connections: WsConnectionInfo[]; count: number }> => {
    return fetchApi('/api/system/ws-connections');
  },
};

// ===== Agent Hooks API =====

export interface AgentHookToolStatus {
  detected: boolean;
  installed: boolean;
  current_version?: number | null;
  outdated?: boolean;
  installed_version?: number | null;
  config_path?: string | null;
  error?: string | null;
}

export interface AgentHookInstallReport {
  claude_code: AgentHookToolStatus;
  codex: AgentHookToolStatus;
  cursor: AgentHookToolStatus;
  gemini: AgentHookToolStatus;
  antigravity: AgentHookToolStatus;
  factory_droid: AgentHookToolStatus;
  kiro: AgentHookToolStatus;
  opencode: AgentHookToolStatus;
  ampcode: AgentHookToolStatus;
  pi: AgentHookToolStatus;
  hermes: AgentHookToolStatus;
  grok_build: AgentHookToolStatus;
}

export type ContestedCliOwner = 'grok-build' | 'cursor' | 'unknown';

export interface CliIdentityResponse {
  command: string;
  owner: ContestedCliOwner;
  resolved_path: string | null;
}

export const agentHooksApi = {
  getStatus: async (): Promise<AgentHookInstallReport> => {
    return fetchHooksApi<AgentHookInstallReport>('/hooks/status');
  },

  installAll: async (): Promise<AgentHookInstallReport> => {
    return fetchHooksApi<AgentHookInstallReport>('/hooks/install', { method: 'POST' });
  },

  uninstallAll: async (): Promise<AgentHookInstallReport> => {
    return fetchHooksApi<AgentHookInstallReport>('/hooks/uninstall', { method: 'POST' });
  },

  installTool: async (tool: string): Promise<AgentHookToolStatus> => {
    return fetchHooksApi<AgentHookToolStatus>(
      `/hooks/${encodeURIComponent(tool)}/install`,
      { method: 'POST' },
    );
  },

  uninstallTool: async (tool: string): Promise<AgentHookToolStatus> => {
    return fetchHooksApi<AgentHookToolStatus>(
      `/hooks/${encodeURIComponent(tool)}/uninstall`,
      { method: 'POST' },
    );
  },

  forceSessionIdle: async (sessionId: string): Promise<{ ok: boolean }> => {
    return fetchHooksApi<{ ok: boolean }>(
      `/hooks/sessions/${encodeURIComponent(sessionId)}/force-idle`,
      { method: 'POST' },
    );
  },

  removeSession: async (
    sessionId: string,
    options?: { keepActivity?: boolean },
  ): Promise<{ ok: boolean }> => {
    const suffix = options?.keepActivity ? "?keep_activity=1" : "";
    return fetchHooksApi<{ ok: boolean }>(
      `/hooks/sessions/${encodeURIComponent(sessionId)}${suffix}`,
      { method: "DELETE" },
    );
  },

  listActivity: async (): Promise<{
    sessions: import("@atmos/api-types/ws/dto/events").AgentActivity[];
  }> => {
    return fetchHooksApi("/hooks/activity");
  },

  /** Sticky need-attention latches held in API memory (survives browser refresh). */
  listAttention: async (): Promise<{ attention: AgentAttentionLatchDto[] }> => {
    return fetchHooksApi<{ attention: AgentAttentionLatchDto[] }>('/hooks/attention');
  },

  /**
   * Workspace Agent grouping snapshot held in API memory (sessions + attention).
   * Survives browser refresh until the local API process restarts.
   */
  listWorkspaceAgentGroups: async (): Promise<{
    groups: WorkspaceAgentGroupSnapshotDto[];
  }> => {
    return fetchHooksApi<{ groups: WorkspaceAgentGroupSnapshotDto[] }>(
      '/hooks/workspace-agent-groups',
    );
  },

  clearAttention: async (input: {
    stablePaneId?: string;
    stablePaneIds?: string[];
    /** RFC3339: only clear latches raised at or before this (dismiss race guard). */
    notAfter?: string;
    /** Also drop auto-summary chrome. Focus-ack omits this; Dismiss / send set it. */
    dismissSummary?: boolean;
  }): Promise<{ cleared: string[] }> => {
    return fetchHooksApi<{ cleared: string[] }>('/hooks/attention/clear', {
      method: 'POST',
      body: JSON.stringify({
        stable_pane_id: input.stablePaneId,
        stable_pane_ids: input.stablePaneIds,
        not_after: input.notAfter,
        dismiss_summary: input.dismissSummary === true ? true : undefined,
      }),
    });
  },

  /** Unattended task-complete auto-summaries held in API memory. */
  listAttentionSummaries: async (): Promise<{
    summaries: AgentAttentionSummaryDto[];
  }> => {
    return fetchHooksApi<{ summaries: AgentAttentionSummaryDto[] }>(
      '/hooks/attention/summaries',
    );
  },

  /** Resolve contested short CLI names (e.g. bare `agent`) to a product owner. */
  getCliIdentity: async (command = 'agent'): Promise<CliIdentityResponse> => {
    return fetchHooksApi<CliIdentityResponse>(
      `/hooks/cli-identity?command=${encodeURIComponent(command)}`,
    );
  },
};

export type AgentAttentionReasonDto = 'permission_request' | 'task_complete';

export type WorkspaceAgentGroupKeyDto =
  | 'permission'
  | 'attention'
  | 'running'
  | 'done'
  | 'idle';

export type WorkspaceAgentGroupSnapshotDto = {
  context_id: string;
  group_key: WorkspaceAgentGroupKeyDto;
};

export type AgentAttentionLatchDto = {
  stable_pane_id: string;
  context_id: string;
  reason: AgentAttentionReasonDto;
  session_id: string;
  tool?: string | null;
  project_path?: string | null;
  raised_at: string;
};

export type AttentionSummaryStatusDto = 'summarizing' | 'ready' | 'error';

export type AgentAttentionSummaryDto = {
  stable_pane_id: string;
  context_id: string;
  session_id: string;
  status: AttentionSummaryStatusDto;
  summary?: string | null;
  next_steps?: string[] | null;
  can_close_session?: boolean | null;
  error?: string | null;
  started_at: string;
  completed_at?: string | null;
};

// ===== Workspace Terminal Layout API =====

// ===== Agent API =====

export interface CreateAgentSessionResponse {
  runtime_session_id: string;
  registry_id: string;
  cwd: string;
  status: string;
}

export interface AgentAuthMethod {
  id: string;
  name: string;
  description?: string;
}

export interface AgentAuthRequiredPayload {
  request_id: string;
  methods: AgentAuthMethod[];
  message: string;
}

export interface AgentImplementationInfo {
  name: string;
  title: string | null;
  version: string;
}

export interface AgentCapabilityState {
  supported: boolean;
  reason: string | null;
}

export interface AgentCapabilities {
  session_list: AgentCapabilityState;
  session_resume: AgentCapabilityState;
  session_close: AgentCapabilityState;
  logout: AgentCapabilityState;
  config_options: AgentCapabilityState;
  session_info_update: AgentCapabilityState;
  load_session: AgentCapabilityState;
}

export interface NativeAgentSessionItem {
  registry_id: string;
  acp_session_id: string;
  title: string | null;
  cwd: string;
  updated_at: string | null;
}

export type AgentChatSessionItem = NativeAgentSessionItem;

export interface ListAgentSessionsResponse {
  registry_id: string;
  agent_info: AgentImplementationInfo | null;
  capabilities: AgentCapabilities;
  items: AgentChatSessionItem[];
  next_cursor: string | null;
  truncated: boolean;
  unsupported_reason: string | null;
}

export interface ResumeAgentSessionResponse extends CreateAgentSessionResponse {
  acp_session_id: string;
}

export interface LogoutAgentResponse {
  registry_id: string;
  agent_info: AgentImplementationInfo | null;
  capabilities: AgentCapabilities;
  logged_out: boolean;
  unsupported_reason: string | null;
}

export const agentApi = {
  /**
   * Create a new Agent chat session.
   * - With workspaceId: Agent has file access to the workspace
   * - With projectId (no workspace): context is project
   * - Without both: General AI assistant, temp context
   */
  createSession: async (
    workspaceId: string | null | undefined,
    projectId: string | null | undefined,
    registryId: string,
    authMethodId?: string | null,
  ): Promise<CreateAgentSessionResponse> => {
    return fetchApi<CreateAgentSessionResponse>('/api/agent/session', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: workspaceId || null,
        project_id: projectId || null,
        registry_id: registryId,
        auth_method_id: authMethodId || null,
      }),
    });
  },

  /**
   * Resume an existing native ACP session by agent-owned session id.
   */
  resumeSession: async (
    registryId: string,
    acpSessionId: string,
    cwd?: string | null,
    workspaceId?: string | null,
    projectId?: string | null,
    authMethodId?: string | null,
  ): Promise<ResumeAgentSessionResponse> => {
    return fetchApi<ResumeAgentSessionResponse>(
      '/api/agent/session/resume',
      {
        method: 'POST',
        body: JSON.stringify({
          registry_id: registryId,
          acp_session_id: acpSessionId,
          cwd: cwd || null,
          workspace_id: workspaceId || null,
          project_id: projectId || null,
          auth_method_id: authMethodId || null,
        }),
      }
    );
  },

  /**
   * List native ACP sessions for one agent.
   */
  listSessions: async (params: {
    registry_id: string;
    cwd?: string | null;
    limit?: number;
    cursor?: string;
    auth_method_id?: string | null;
  }): Promise<ListAgentSessionsResponse> => {
    const search = new URLSearchParams();
    search.set('registry_id', params.registry_id);
    if (params.cwd) search.set('cwd', params.cwd);
    if (params.limit) search.set('limit', String(params.limit));
    if (params.cursor) search.set('cursor', params.cursor);
    if (params.auth_method_id) search.set('auth_method_id', params.auth_method_id);
    const qs = search.toString();
    return fetchApi<ListAgentSessionsResponse>(
      `/api/agent/sessions${qs ? `?${qs}` : ''}`
    );
  },

  logoutAgent: async (
    registryId: string,
    cwd?: string | null,
    authMethodId?: string | null,
  ): Promise<LogoutAgentResponse> => {
    return fetchApi<LogoutAgentResponse>('/api/agent/logout', {
      method: 'POST',
      body: JSON.stringify({
        registry_id: registryId,
        cwd: cwd || null,
        auth_method_id: authMethodId || null,
      }),
    });
  },

  /**
   * Upload attachment files to workspace .atmos/attachments/ directory.
   * Returns the saved file paths that can be referenced in agent prompts.
   */
  uploadAttachments: async (
    localPath: string,
    files: { url: string; filename?: string; mediaType?: string }[]
  ): Promise<{ paths: string[] }> => {
    const formData = new FormData();
    formData.append('local_path', localPath);

    for (const file of files) {
      const response = await fetch(file.url);
      const blob = await response.blob();
      const name = file.filename || 'attachment';
      formData.append('files', new File([blob], name, { type: file.mediaType || blob.type }));
    }

    const { apiBase, bearer } = await resolveHttpFetchTarget();
    const headers = new Headers();
    if (bearer) {
      headers.set('Authorization', `Bearer ${bearer}`);
    }
    const res = await fetch(`${apiBase}/api/agent/upload-attachments`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.statusText}`);
    }

    const json: ApiResponse<{ paths: string[] }> = await res.json();
    if (!json.success) {
      throw new Error(json.message || 'Upload failed');
    }
    return json.data;
  },
};

// ===== Project Terminal Layout API =====

export const projectLayoutApi = {
  /**
   * Update maximized terminal ID for a project
   */
  updateMaximizedTerminalId: async (projectId: string, terminalId: string | null): Promise<void> => {
    await fetchApi<{ message: string }>(`/api/project/${projectId}/maximized-terminal-id`, {
      method: 'PUT',
      body: JSON.stringify({ terminal_id: terminalId }),
    });
  },
};

// ===== Workspace Terminal Layout API =====

export const workspaceLayoutApi = {
  /**
   * Update maximized terminal ID for a workspace
   */
  updateMaximizedTerminalId: async (workspaceId: string, terminalId: string | null): Promise<void> => {
    await fetchApi<{ message: string }>(`/api/workspace/${workspaceId}/maximized-terminal-id`, {
      method: 'PUT',
      body: JSON.stringify({ terminal_id: terminalId }),
    });
  },
};

export const canvasApi = {
  listDocuments: async (): Promise<CanvasDocumentListResponse> => {
    return fetchApi<CanvasDocumentListResponse>("/api/canvas/documents");
  },

  createNewDocument: async (): Promise<CanvasDocumentWriteResponse> => {
    return fetchApi<CanvasDocumentWriteResponse>("/api/canvas/documents/new", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  getDocument: async (fileName: string): Promise<CanvasDocumentFileResponse> => {
    return fetchApi<CanvasDocumentFileResponse>(
      `/api/canvas/documents/${encodeURIComponent(fileName)}`,
    );
  },

  putDocument: async (
    fileName: string,
    body: AtmosCanvasFile,
    options?: { overwrite?: boolean },
  ): Promise<CanvasDocumentWriteResponse> => {
    const overwrite = options?.overwrite === true;
    const qs = overwrite ? "?overwrite=true" : "";
    return fetchApi<CanvasDocumentWriteResponse>(
      `/api/canvas/documents/${encodeURIComponent(fileName)}${qs}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  },

  sanitizeName: async (name: string): Promise<{ file_name: string }> => {
    return fetchApi<{ file_name: string }>("/api/canvas/documents/sanitize-name", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  deleteDocument: async (fileName: string): Promise<{ deleted: string }> => {
    return fetchApi<{ deleted: string }>(
      `/api/canvas/documents/${encodeURIComponent(fileName)}`,
      { method: "DELETE" },
    );
  },

  renameDocument: async (
    fileName: string,
    name: string,
  ): Promise<CanvasDocumentWriteResponse> => {
    return fetchApi<CanvasDocumentWriteResponse>(
      `/api/canvas/documents/${encodeURIComponent(fileName)}/rename`,
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    );
  },

  duplicateDocument: async (
    fileName: string,
    name?: string,
  ): Promise<CanvasDocumentWriteResponse> => {
    return fetchApi<CanvasDocumentWriteResponse>(
      `/api/canvas/documents/${encodeURIComponent(fileName)}/duplicate`,
      {
        method: "POST",
        body: JSON.stringify({ name: name ?? null }),
      },
    );
  },
};

export type PtDesignLibraryItem = {
  name: string;
  modified_at: number;
  size_bytes: number;
};

export type PtDesignLibraryList = {
  dir: string;
  items: PtDesignLibraryItem[];
};

export const ptDesignApi = {
  listDocuments: async (): Promise<PtDesignLibraryList> => {
    return fetchApi<PtDesignLibraryList>("/api/pt-design/documents");
  },

  getDocument: async (name: string): Promise<{ name: string; body: { scene?: unknown } }> => {
    return fetchApi<{ name: string; body: { scene?: unknown } }>(
      `/api/pt-design/documents/${encodeURIComponent(name)}`,
    );
  },

  putDocument: async (
    name: string,
    body: unknown,
    options?: { overwrite?: boolean },
  ): Promise<{ name: string }> => {
    const qs = options?.overwrite === false ? "" : "?overwrite=true";
    return fetchApi<{ name: string }>(`/api/pt-design/documents/${encodeURIComponent(name)}${qs}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
};
