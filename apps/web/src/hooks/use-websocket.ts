'use client';

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// ===== 类型定义 =====

export type WsAction =
  // 文件系统操作
  | 'fs_get_home_dir'
  | 'fs_list_dir'
  | 'fs_validate_git_path'
  // Project 操作
  | 'project_list'
  | 'project_create'
  | 'project_update'
  | 'project_delete'
  | 'project_validate_path'
  // Workspace 操作
  | 'workspace_list'
  | 'workspace_create'
  | 'workspace_update_name'
  | 'workspace_update_branch'
  | 'workspace_update_order'
  | 'workspace_delete';

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

export type WsMessage = WsRequest | WsResponse | WsError | { type: 'ping' } | { type: 'pong' };

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
  
  // 内部方法
  _startHeartbeat: () => void;
  _stopHeartbeat: () => void;
  _handleMessage: (event: MessageEvent) => void;
  _scheduleReconnect: () => void;
}

// 获取 WebSocket URL
const getWsUrl = (): string => {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8080/api/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 在开发环境中使用后端端口
  const host = process.env.NODE_ENV === 'development' ? 'localhost:8080' : window.location.host;
  return `${protocol}//${host}/api/ws`;
};

export const useWebSocketStore = create<WebSocketStore>((set, get) => ({
  // 初始状态
  connectionState: 'disconnected',
  socket: null,
  pendingRequests: new Map(),
  
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
            pending.reject(new Error(`Request failed: ${JSON.stringify(data)}`));
          }
        }
        return;
      }
      
      // 处理错误
      if (message.type === 'error') {
        const { request_id, code, message: errorMessage } = message.payload;
        const pending = pendingRequests.get(request_id);
        
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(request_id);
          pending.reject(new Error(`[${code}] ${errorMessage}`));
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
