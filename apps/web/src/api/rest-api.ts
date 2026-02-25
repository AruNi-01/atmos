'use client';

/**
 * REST API client for endpoints that need to be called before WebSocket connection
 * or when WebSocket is not available.
 */

const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) {
      return `${window.location.protocol}//${window.location.hostname}:8080`;
    }
  }
  return 'http://localhost:8080';
};

const API_BASE = getApiBase();

/** WebSocket base URL for agent chat (ws/wss derived from API base) */
export const getAgentWsBase = (): string => {
  const base = getApiBase();
  return base.replace(/^http/, 'ws');
};

// ===== Types =====

export interface TmuxStatusResponse {
  installed: boolean;
  version: string | null;
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
}

export interface TerminalLayoutResponse {
  layout: string | null;
  maximized_terminal_id?: string | null;
}

// ===== API Response wrapper =====

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

// ===== Terminal Overview Types =====

export type SessionType = 'tmux' | 'simple';

export interface ActiveSessionInfo {
  session_id: string;
  workspace_id: string;
  session_type: SessionType;
  project_name: string | null;
  workspace_name: string | null;
  terminal_name: string | null;
  tmux_session: string | null;
  tmux_window_index: number | null;
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

// ===== System API =====

export const systemApi = {
  /**
   * Check tmux installation status
   */
  getTmuxStatus: async (): Promise<TmuxStatusResponse> => {
    return fetchApi<TmuxStatusResponse>('/api/system/tmux-status');
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
   * Get comprehensive terminal overview for Terminal Manager
   */
  getTerminalOverview: async (): Promise<TerminalOverviewResponse> => {
    return fetchApi<TerminalOverviewResponse>('/api/system/terminal-overview');
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
};

// ===== Workspace Terminal Layout API =====

// ===== Agent API =====

export interface CreateAgentSessionResponse {
  session_id: string;
  cwd: string;
  title: string | null;
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

export interface AgentChatSessionItem {
  guid: string;
  title: string | null;
  title_source: string | null;
  context_type: string;
  context_guid: string | null;
  registry_id: string;
  status: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

export interface ListAgentSessionsResponse {
  items: AgentChatSessionItem[];
  next_cursor: string | null;
  has_more: boolean;
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
    mode: "default" | "wiki_ask" = "default"
  ): Promise<CreateAgentSessionResponse> => {
    return fetchApi<CreateAgentSessionResponse>('/api/agent/session', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: workspaceId || null,
        project_id: projectId || null,
        registry_id: registryId,
        auth_method_id: authMethodId || null,
        mode,
      }),
    });
  },

  /**
   * Resume an existing session by session id (no new DB row).
   */
  resumeSession: async (
    sessionId: string,
    mode: "default" | "wiki_ask" = "default"
  ): Promise<CreateAgentSessionResponse> => {
    const qs = new URLSearchParams({ mode }).toString();
    return fetchApi<CreateAgentSessionResponse>(
      `/api/agent/sessions/${sessionId}/resume?${qs}`,
      {
        method: 'POST',
      }
    );
  },

  /**
   * List agent chat sessions with cursor pagination.
   */
  listSessions: async (params?: {
    context_type?: string;
    context_guid?: string;
    mode?: "default" | "wiki_ask";
    limit?: number;
    cursor?: string;
  }): Promise<ListAgentSessionsResponse> => {
    const search = new URLSearchParams();
    if (params?.context_type) search.set('context_type', params.context_type);
    if (params?.context_guid) search.set('context_guid', params.context_guid);
    if (params?.mode) search.set('mode', params.mode);
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    const qs = search.toString();
    return fetchApi<ListAgentSessionsResponse>(
      `/api/agent/sessions${qs ? `?${qs}` : ''}`
    );
  },

  /**
   * Update session title (user-edited).
   */
  updateSessionTitle: async (
    sessionId: string,
    title: string
  ): Promise<{ ok: boolean }> => {
    return fetchApi<{ ok: boolean }>(
      `/api/agent/sessions/${sessionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }
    );
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

    const res = await fetch(`${API_BASE}/api/agent/upload-attachments`, {
      method: 'POST',
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

// ===== Workspace Terminal Layout API =====

export const workspaceLayoutApi = {
  /**
   * Get terminal layout for a workspace
   */
  getLayout: async (workspaceId: string): Promise<TerminalLayoutResponse> => {
    return fetchApi<TerminalLayoutResponse>(`/api/workspace/${workspaceId}/terminal-layout`);
  },

  /**
   * Update terminal layout for a workspace
   */
  updateLayout: async (workspaceId: string, layout: string | null): Promise<void> => {
    await fetchApi<{ message: string }>(`/api/workspace/${workspaceId}/terminal-layout`, {
      method: 'PUT',
      body: JSON.stringify({ layout }),
    });
  },

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
