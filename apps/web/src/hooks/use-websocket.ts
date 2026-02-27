'use client';

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { toastManager } from '@workspace/ui';

// ===== 类型定义 =====

export type WsAction =
  // 文件系统操作
  | 'fs_get_home_dir'
  | 'fs_list_dir'
  | 'fs_search_dirs'
  | 'fs_validate_git_path'
  | 'fs_read_file'
  | 'fs_write_file'
  | 'fs_list_project_files'
  | 'fs_search_content'
  // App 操作
  | 'app_open'
  // Git 操作
  | 'git_get_status'
  | 'git_get_head_commit'
  | 'git_get_commit_count'
  | 'git_list_branches'
  | 'git_list_remote_branches'
  | 'git_rename_branch'
  | 'git_changed_files'
  | 'git_file_diff'
  | 'git_commit'
  | 'git_push'
  | 'git_stage'
  | 'git_unstage'
  | 'git_discard_unstaged'
  | 'git_discard_untracked'
  | 'git_pull'
  | 'git_fetch'
  | 'git_sync'
  // Project 操作
  | 'project_list'
  | 'project_create'
  | 'project_update'
  | 'project_update_target_branch'
  | 'project_update_order'
  | 'project_delete'
  | 'project_validate_path'
  // Script 操作
  | 'script_get'
  | 'script_save'
  // Workspace 操作
  | 'workspace_list'
  | 'workspace_create'
  | 'workspace_update_name'
  | 'workspace_update_branch'
  | 'workspace_update_order'
  | 'workspace_delete'
  | 'workspace_pin'
  | 'workspace_unpin'
  | 'workspace_archive'
  | 'workspace_list_archived'
  | 'workspace_unarchive'
  | 'workspace_retry_setup'
  // Project 检查操作
  | 'project_check_can_delete'
  // Skills 操作
  | 'skills_list'
  | 'skills_get'
  | 'wiki_skill_install'
  | 'wiki_skill_system_status'
  | 'code_review_skill_system_status'
  | 'skills_system_sync'
  // Agent 操作
  | 'agent_list'
  | 'agent_install'
  | 'agent_config_get'
  | 'agent_config_set'
  | 'agent_registry_list'
  | 'agent_registry_install'
  | 'agent_registry_remove'
  // Custom Agent 操作
  | 'custom_agent_list'
  | 'custom_agent_add'
  | 'custom_agent_remove'
  | 'custom_agent_get_json'
  | 'custom_agent_set_json'
  | 'custom_agent_get_manifest_path'
  // GitHub 操作
  | 'github_pr_list'
  | 'github_pr_detail'
  | 'github_pr_create'
  | 'github_pr_merge'
  | 'github_pr_close'
  | 'github_pr_reopen'
  | 'github_pr_comment'
  | 'github_pr_ready'
  | 'github_pr_draft'
  | 'github_pr_open_browser'
  | 'github_ci_status'
  | 'github_ci_open_browser'
  | 'github_actions_list'
  | 'github_actions_rerun'
  | 'github_actions_detail';

export interface WsRequest {
  type: 'request';
  payload: {
    request_id: string;
    action: WsAction;
    data: unknown;
  };
}

export interface WsResponse {
  type: 'response';
  payload: {
    request_id: string;
    success: boolean;
    data: unknown;
  };
}

export interface WsError {
  type: 'error';
  payload: {
    request_id: string;
    code: string;
    message: string;
  };
}

export interface WsNotification {
  type: 'notification';
  payload: {
    event: string;
    data: unknown;
  };
}

export type WsMessage = WsRequest | WsResponse | WsError | WsNotification | { type: 'ping' } | { type: 'pong' };

// ===== WebSocket 状态管理 =====

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface WebSocketStore {
  // 状态
  connectionState: ConnectionState;
  socket: WebSocket | null;
  pendingRequests: Map<string, PendingRequest>;
  eventListeners: Map<string, Set<(data: unknown) => void>>;
  
  // 配置
  url: string;
  heartbeatInterval: number;
  reconnectInterval: number;
  requestTimeout: number;
  
  // 内部状态
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  
  // 动作
  connect: () => void;
  disconnect: () => void;
  send: <T = unknown>(action: WsAction, data?: unknown) => Promise<T>;
  onEvent: (event: string, callback: (data: unknown) => void) => () => void;
  
  // 内部方法
  _startHeartbeat: () => void;
  _stopHeartbeat: () => void;
  _handleMessage: (event: MessageEvent) => void;
  _scheduleReconnect: () => void;
}

// 获取 WebSocket URL
const getWsUrl = (): string => {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8080/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 优先使用环境变量，支持 Tailscale 等内网穿透场景
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return `${process.env.NEXT_PUBLIC_WS_URL}/ws`;
  }
  // 在开发环境中：如果通过非 localhost 访问（如 Tailscale），使用当前 host + 后端端口
  if (process.env.NODE_ENV === 'development') {
    const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'localhost:8080'
      : `${window.location.hostname}:8080`;
    return `${protocol}//${host}/ws`;
  }
  return `${protocol}//${window.location.host}/ws`;
};

export const useWebSocketStore = create<WebSocketStore>((set, get) => ({
  // 初始状态
  connectionState: 'disconnected',
  socket: null,
  pendingRequests: new Map(),
  eventListeners: new Map(),
  
  // 配置
  url: getWsUrl(),
  heartbeatInterval: 15000, // 15 秒心跳
  reconnectInterval: 3000,  // 3 秒重连
  requestTimeout: 30000,    // 30 秒超时
  
  // 内部状态
  heartbeatTimer: null,
  reconnectTimer: null,
  
  // 连接
  connect: () => {
    const { socket, connectionState, url } = get();
    
    // 如果已连接或正在连接，跳过
    if (socket && (connectionState === 'connected' || connectionState === 'connecting')) {
      return;
    }
    
    set({ connectionState: 'connecting' });
    
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        set({ connectionState: 'connected', socket: ws });
        get()._startHeartbeat();
      };
      
      ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason);
        get()._stopHeartbeat();
        set({ connectionState: 'disconnected', socket: null });
        
        // 自动重连
        if (!event.wasClean) {
          get()._scheduleReconnect();
        }
      };
      
      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
      
      ws.onmessage = (event) => {
        get()._handleMessage(event);
      };
      
      set({ socket: ws });
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      set({ connectionState: 'disconnected' });
      get()._scheduleReconnect();
    }
  },
  
  // 断开连接
  disconnect: () => {
    const { socket, heartbeatTimer, reconnectTimer, pendingRequests } = get();
    
    // 清理定时器
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    
    // 拒绝所有待处理的请求
    pendingRequests.forEach((pending, requestId) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('WebSocket disconnected'));
    });
    
    // 关闭连接
    if (socket) {
      socket.close(1000, 'Client disconnect');
    }
    
    set({
      socket: null,
      connectionState: 'disconnected',
      heartbeatTimer: null,
      reconnectTimer: null,
      pendingRequests: new Map(),
    });
  },
  
  // 发送请求
  send: <T = unknown>(action: WsAction, data: unknown = {}): Promise<T> => {
    return new Promise((resolve, reject) => {
      const { socket, connectionState, pendingRequests, requestTimeout } = get();
      
      if (!socket || connectionState !== 'connected') {
        reject(new Error('WebSocket not connected'));
        return;
      }
      
      const requestId = uuidv4();
      
      const request: WsRequest = {
        type: 'request',
        payload: {
          request_id: requestId,
          action,
          data,
        },
      };
      
      // 设置超时
      const timeout = setTimeout(() => {
        const pending = pendingRequests.get(requestId);
        if (pending) {
          pendingRequests.delete(requestId);
          pending.reject(new Error(`Request timeout: ${action}`));
        }
      }, requestTimeout);
      
      // 存储待处理请求
      pendingRequests.set(requestId, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timeout,
      });
      
      // 发送请求
      try {
        socket.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        reject(error);
      }
    });
  },
  
  // 注册事件监听
  onEvent: (event: string, callback: (data: unknown) => void) => {
    const { eventListeners } = get();
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(callback);
    
    // 返回卸载函数
    return () => {
      const listeners = get().eventListeners.get(event);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  },
  
  // 启动心跳
  _startHeartbeat: () => {
    const { heartbeatInterval, socket } = get();
    
    const timer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send('ping');
      }
    }, heartbeatInterval);
    
    set({ heartbeatTimer: timer });
  },
  
  // 停止心跳
  _stopHeartbeat: () => {
    const { heartbeatTimer } = get();
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      set({ heartbeatTimer: null });
    }
  },
  
  // 处理消息
  _handleMessage: (event: MessageEvent) => {
    const { pendingRequests } = get();
    
    try {
      // 处理简单的 pong 响应
      if (event.data === 'pong') {
        return;
      }
      
      const message = JSON.parse(event.data) as WsMessage;
      
      // 处理 pong
      if (message.type === 'pong') {
        return;
      }
      
      // 处理响应
      if (message.type === 'response') {
        const { request_id, success, data } = message.payload;
        const pending = pendingRequests.get(request_id);
        
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(request_id);
          
          if (success) {
            pending.resolve(data);
          } else {
            const errorMessage = typeof data === 'string' ? data : JSON.stringify(data);
            toastManager.add({
              title: "Request Failed",
              description: errorMessage,
              type: "error"
            });
            pending.reject(new Error(`Request failed: ${errorMessage}`));
          }
        }
        return;
      }
      
      // 处理错误
      if (message.type === 'error') {
        const payload = message.payload;

        if (!payload || !payload.request_id) {
          console.warn('[WebSocket] Received malformed error message:', message);
          return;
        }

        const { request_id, code, message: errorMessage } = payload;
        const pending = pendingRequests.get(request_id);
        
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(request_id);
          
          toastManager.add({
            title: "Error",
            description: errorMessage,
            type: "error"
          });
          
          pending.reject(new Error(`[${code}] ${errorMessage}`));
        }
        return;
      }
      
      // 处理通知
      if (message.type === 'notification') {
        const { event: eventName, data } = message.payload;
        const listeners = get().eventListeners.get(eventName);
        if (listeners) {
          listeners.forEach(cb => cb(data));
        }
        return;
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  },
  
  // 调度重连
  _scheduleReconnect: () => {
    const { reconnectInterval, reconnectTimer } = get();
    
    // 避免重复调度
    if (reconnectTimer) {
      return;
    }
    
    set({ connectionState: 'reconnecting' });
    
    const timer = setTimeout(() => {
      set({ reconnectTimer: null });
      get().connect();
    }, reconnectInterval);
    
    set({ reconnectTimer: timer });
  },
}));

// ===== 自定义 Hook =====

/**
 * 使用 WebSocket 连接的 Hook
 * 
 * 在应用根组件中调用以建立连接：
 * ```tsx
 * const { connect, connectionState } = useWebSocket();
 * useEffect(() => { connect(); }, []);
 * ```
 */
export function useWebSocket() {
  const { connectionState, connect, disconnect, send } = useWebSocketStore();
  
  return {
    connectionState,
    isConnected: connectionState === 'connected',
    connect,
    disconnect,
    send,
  };
}
