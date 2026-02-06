'use client';

/**
 * REST API client for endpoints that need to be called before WebSocket connection
 * or when WebSocket is not available.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

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
    throw new Error(`API error: ${response.status} ${response.statusText}`);
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

export interface FdLimits {
  soft_limit: number | null;
  hard_limit: number | null;
  system_limit: number | null;
  process_open_fds: number | null;
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
  fd_limits: FdLimits;
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
   * Kill a specific tmux session
   */
  killTmuxSession: async (sessionName: string): Promise<{ killed: boolean; session_name?: string; error?: string }> => {
    return fetchApi<{ killed: boolean; session_name?: string; error?: string }>('/api/system/tmux-kill-session', {
      method: 'POST',
      body: JSON.stringify({ session_name: sessionName }),
    });
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
