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
