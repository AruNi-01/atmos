"use client";

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { isTauriRuntime } from "@/lib/desktop-runtime";
import { buildWsUrl, buildWsUrlSync } from "@/lib/ws-url";
import { debugLog } from "@/lib/desktop-logger";
import { getDebugLogger } from "@atmos/shared/debug/debug-logger";

// ===== 类型定义 =====

export type WsAction =
  // 文件系统操作
  | "fs_get_home_dir"
  | "fs_list_dir"
  | "fs_search_dirs"
  | "fs_validate_git_path"
  | "fs_read_file"
  | "fs_write_file"
  | "fs_create_dir"
  | "fs_rename_path"
  | "fs_delete_path"
  | "fs_duplicate_path"
  | "fs_list_project_files"
  | "fs_search_content"
  // App 操作
  | "app_open"
  // Git 操作
  | "git_get_status"
  | "git_get_head_commit"
  | "git_get_commit_count"
  | "git_list_branches"
  | "git_list_remote_branches"
  | "git_rename_branch"
  | "git_changed_files"
  | "git_file_diff"
  | "git_generate_commit_message"
  | "git_commit"
  | "git_push"
  | "git_stage"
  | "git_unstage"
  | "git_discard_unstaged"
  | "git_discard_untracked"
  | "git_pull"
  | "git_fetch"
  | "git_sync"
  | "git_log"
  // Usage 操作
  | "usage_get_overview"
  | "usage_set_provider_switch"
  | "usage_set_provider_footer_carousel"
  | "usage_set_all_providers_switch"
  | "usage_set_provider_manual_setup"
  | "usage_add_provider_api_key"
  | "usage_delete_provider_api_key"
  | "usage_set_auto_refresh"
  // Project 操作
  | "project_list"
  | "project_create"
  | "project_update"
  | "project_update_target_branch"
  | "project_update_order"
  | "project_delete"
  | "project_validate_path"
  // Script 操作
  | "script_get"
  | "script_save"
  // Workspace 操作
  | "workspace_list"
  | "workspace_create"
  | "workspace_update_name"
  | "workspace_update_branch"
  | "workspace_update_workflow_status"
  | "workspace_update_priority"
  | "workspace_label_list"
  | "workspace_label_create"
  | "workspace_label_update"
  | "workspace_update_labels"
  | "workspace_update_order"
  | "workspace_mark_visited"
  | "workspace_delete"
  | "workspace_pin"
  | "workspace_unpin"
  | "workspace_update_pin_order"
  | "workspace_archive"
  | "workspace_list_archived"
  | "workspace_unarchive"
  | "workspace_retry_setup"
  | "workspace_skip_setup_step"
  | "workspace_skip_setup_script"
  | "workspace_confirm_todos"
  // Project 检查操作
  | "project_check_can_delete"
  // Skills 操作
  | "skills_list"
  | "skills_get"
  | "skills_set_enabled"
  | "skills_delete"
  | "wiki_skill_install"
  | "wiki_skill_system_status"
  | "code_review_skill_system_status"
  | "git_commit_skill_system_status"
  | "sync_single_system_skill"
  | "skills_system_sync"
  // Function settings
  | "function_settings_get"
  | "function_settings_update"
  | "llm_providers_get"
  | "llm_providers_update"
  | "llm_provider_test"
  // Code Agent custom settings
  | "code_agent_custom_get"
  | "code_agent_custom_update"
  | "agent_behaviour_settings_get"
  | "agent_behaviour_settings_update"
  // Notification settings
  | "notification_settings_get"
  | "notification_settings_update"
  | "notification_test_push"
  // LSP 操作
  | "lsp_activate_for_file"
  | "lsp_connect_for_file"
  | "lsp_status_for_file"
  | "lsp_restart_for_file"
  | "lsp_channel_send"
  | "lsp_channel_disconnect"
  // Agent 操作
  | "agent_list"
  | "agent_install"
  | "agent_config_get"
  | "agent_config_set"
  | "agent_behaviour_settings_get"
  | "agent_behaviour_settings_update"
  | "agent_registry_list"
  | "agent_registry_install"
  | "agent_registry_remove"
  // Custom Agent 操作
  | "custom_agent_list"
  | "custom_agent_add"
  | "custom_agent_remove"
  | "custom_agent_get_json"
  | "custom_agent_set_json"
  | "custom_agent_get_manifest_path"
  // GitHub 操作
  | "github_pr_list"
  | "github_pr_detail"
  | "github_pr_detail_sidebar"
  | "github_pr_timeline_page"
  | "github_pr_create"
  | "github_pr_merge"
  | "github_pr_close"
  | "github_pr_reopen"
  | "github_pr_comment"
  | "github_pr_ready"
  | "github_pr_draft"
  | "github_pr_open_browser"
  | "github_issue_list"
  | "github_issue_get"
  | "github_ci_status"
  | "github_ci_open_browser"
  | "github_actions_list"
  | "github_actions_rerun"
  | "github_actions_detail";

export interface WsRequest {
  type: "request";
  payload: {
    request_id: string;
    action: WsAction;
    data: unknown;
  };
}

export interface WsResponse {
  type: "response";
  payload: {
    request_id: string;
    success: boolean;
    data: unknown;
  };
}

export interface WsError {
  type: "error";
  payload: {
    request_id: string;
    code: string;
    message: string;
  };
}

export interface WsNotification {
  type: "notification";
  payload: {
    event: string;
    data: unknown;
  };
}

export type WsMessage =
  | WsRequest
  | WsResponse
  | WsError
  | WsNotification
  | { type: "ping" }
  | { type: "pong" };

// ===== WebSocket 状态管理 =====

type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

interface PendingRequest {
  action: WsAction;
  startedAt: number;
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
  maxReconnectAttempts: number;

  // 内部状态
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;

  // 动作
  connect: () => Promise<void>;
  disconnect: () => void;
  send: <T = unknown>(
    action: WsAction,
    data?: unknown,
    timeoutMs?: number,
  ) => Promise<T>;
  onEvent: (event: string, callback: (data: unknown) => void) => () => void;

  // 内部方法
  _startHeartbeat: () => void;
  _stopHeartbeat: () => void;
  _handleMessage: (event: MessageEvent) => void;
  _scheduleReconnect: () => void;
}

const getWsUrl = (): string => buildWsUrlSync("/ws");
const wsDebugLogger = getDebugLogger("ws-main", "http://127.0.0.1:30303");

export const useWebSocketStore = create<WebSocketStore>((set, get) => ({
  // 初始状态
  connectionState: "disconnected",
  socket: null,
  pendingRequests: new Map(),
  eventListeners: new Map(),

  // 配置
  url: getWsUrl(),
  heartbeatInterval: 15000,
  reconnectInterval: 1000,
  requestTimeout: 30000,
  maxReconnectAttempts: 10,

  // 内部状态
  heartbeatTimer: null,
  reconnectTimer: null,
  reconnectAttempts: 0,

  // 连接
  connect: async () => {
    const { connectionState } = get();

    // Prevent duplicate connections: only allow connect from 'disconnected' state.
    if (connectionState === "connected" || connectionState === "connecting") {
      return;
    }

    set({ connectionState: "connecting" });

    try {
      const clientType = isTauriRuntime() ? "desktop" : "web";
      const runtimeUrl = await buildWsUrl("/ws", { client_type: clientType });

      // Re-check after async gap — another connect() may have won the race.
      if (get().connectionState !== "connecting") return;

      debugLog(`ws:connect url=${runtimeUrl.replace(/token=[^&]+/, "token=<redacted>")}`);
      console.log(
        "[WebSocket] Connecting to:",
        runtimeUrl.replace(/token=[^&]+/, "token=<redacted>"),
      );

      // Close any lingering socket before creating a new one.
      const prev = get().socket;
      if (
        prev &&
        (prev.readyState === WebSocket.OPEN ||
          prev.readyState === WebSocket.CONNECTING)
      ) {
        prev.onclose = null;
        prev.close(1000, "Replaced");
      }

      const ws = new WebSocket(runtimeUrl);

      // Store socket immediately so subsequent connect() calls see it.
      set({ socket: ws, url: runtimeUrl });

      ws.onopen = () => {
        debugLog("ws:onopen connected");
        console.log("[WebSocket] Connected");
        const { reconnectTimer } = get();
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
        }
        set({ connectionState: "connected", socket: ws, reconnectAttempts: 0, reconnectTimer: null });
        get()._startHeartbeat();
      };

      ws.onclose = (event) => {
        if (get().socket !== ws) return;
        debugLog(
          `ws:onclose code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`,
        );
        console.log(
          "[WebSocket] Disconnected:",
          event.code,
          event.reason,
          "wasClean:",
          event.wasClean,
        );
        get()._stopHeartbeat();

        const { pendingRequests } = get();
        pendingRequests.forEach((pending) => {
          clearTimeout(pending.timeout);
          pending.reject(new Error("WebSocket connection closed"));
        });

        set({ connectionState: "disconnected", socket: null, pendingRequests: new Map() });

        if (!event.wasClean) {
          get()._scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        debugLog(`ws:onerror ${JSON.stringify(error)}`);
        console.error("[WebSocket] Error:", error);
      };

      ws.onmessage = (event) => {
        get()._handleMessage(event);
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugLog(`ws:connect catch err=${msg}`);
      console.error("[WebSocket] Connection failed:", error);
      set({ connectionState: "disconnected", socket: null });
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
    pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error("WebSocket disconnected"));
    });

    // 关闭连接
    if (socket) {
      socket.close(1000, "Client disconnect");
    }

    set({
      socket: null,
      connectionState: "disconnected",
      heartbeatTimer: null,
      reconnectTimer: null,
      pendingRequests: new Map(),
    });
  },

  // 发送请求
  send: <T = unknown>(
    action: WsAction,
    data: unknown = {},
    timeoutMs?: number,
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const { socket, connectionState, pendingRequests, requestTimeout } =
        get();

      if (!socket || connectionState !== "connected") {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const requestId = uuidv4();
      const startedAt = Date.now();

      const request: WsRequest = {
        type: "request",
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
          wsDebugLogger.log("WS_REQUEST_TIMEOUT", "WebSocket request timed out", {
            action,
            requestId,
            elapsedMs: Date.now() - startedAt,
            connectionState: get().connectionState,
            pendingCount: pendingRequests.size,
          });
          pending.reject(new Error(`Request timeout: ${action}`));
        }
      }, timeoutMs ?? requestTimeout);

      // 存储待处理请求
      pendingRequests.set(requestId, {
        action,
        startedAt,
        resolve: resolve as (data: unknown) => void,
        reject,
        timeout,
      });

      if (
        action === "lsp_status_for_file" ||
        action === "lsp_connect_for_file" ||
        action === "lsp_restart_for_file" ||
        action === "fs_read_file"
      ) {
        wsDebugLogger.log("WS_REQUEST_SEND", "Sending WebSocket request", {
          action,
          requestId,
          pendingCount: pendingRequests.size,
        });
      }

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

  _startHeartbeat: () => {
    // Stop any previous heartbeat to avoid stacking multiple intervals.
    const prev = get().heartbeatTimer;
    if (prev) clearInterval(prev);

    const { heartbeatInterval } = get();
    const timer = setInterval(() => {
      // Read socket from store each tick — NOT a stale closure capture.
      const ws = get().socket;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, heartbeatInterval);

    set({ heartbeatTimer: timer });
  },

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
      if (event.data === "pong") {
        return;
      }

      const message = JSON.parse(event.data) as WsMessage;

      // 处理 pong
      if (message.type === "pong") {
        return;
      }

      // 处理响应
      if (message.type === "response") {
        const { request_id, success, data } = message.payload;
        const pending = pendingRequests.get(request_id);

        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(request_id);

          if (
            pending.action === "lsp_status_for_file" ||
            pending.action === "lsp_connect_for_file" ||
            pending.action === "lsp_restart_for_file" ||
            pending.action === "fs_read_file"
          ) {
            wsDebugLogger.log("WS_RESPONSE", "Received WebSocket response", {
              action: pending.action,
              requestId: request_id,
              success,
              elapsedMs: Date.now() - pending.startedAt,
              pendingCount: pendingRequests.size,
            });
          }

          if (success) {
            pending.resolve(data);
          } else {
            const errorMessage =
              typeof data === "string" ? data : JSON.stringify(data);
            pending.reject(new Error(`Request failed: ${errorMessage}`));
          }
        }
        return;
      }

      // 处理错误
      if (message.type === "error") {
        const payload = message.payload;

        if (!payload || !payload.request_id) {
          console.warn(
            "[WebSocket] Received malformed error message:",
            message,
          );
          return;
        }

        const { request_id, code, message: errorMessage } = payload;
        const pending = pendingRequests.get(request_id);

        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(request_id);
          wsDebugLogger.log("WS_ERROR_RESPONSE", "Received WebSocket error response", {
            action: pending.action,
            requestId: request_id,
            code,
            errorMessage,
            elapsedMs: Date.now() - pending.startedAt,
            pendingCount: pendingRequests.size,
          });
          pending.reject(new Error(`[${code}] ${errorMessage}`));
        }
        return;
      }

      // 处理通知
      if (message.type === "notification") {
        const { event: eventName, data } = message.payload;
        if (eventName === "agent_hook_state_changed") {
          console.debug("[WS] agent_hook_state_changed:", (data as Record<string, unknown>)?.tool, (data as Record<string, unknown>)?.state, "listeners:", get().eventListeners.get(eventName)?.size ?? 0);
        }
        const listeners = get().eventListeners.get(eventName);
        if (listeners) {
          listeners.forEach((cb) => cb(data));
        }
        return;
      }
    } catch (error) {
      console.error("[WebSocket] Failed to parse message:", error);
    }
  },

  _scheduleReconnect: () => {
    const { reconnectInterval, reconnectTimer, reconnectAttempts, maxReconnectAttempts } = get();

    if (reconnectTimer) {
      return;
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      console.warn(`[WebSocket] Max reconnect attempts (${maxReconnectAttempts}) reached, will retry every 60s`);
      // Instead of giving up permanently, schedule a slow periodic retry
      // so the connection recovers without requiring a page reload.
      set({ connectionState: "disconnected", reconnectAttempts: 0 });
      const timer = setTimeout(() => {
        set({ reconnectTimer: null });
        get().connect();
      }, 60000);
      set({ reconnectTimer: timer });
      return;
    }

    const delay = Math.min(reconnectInterval * Math.pow(2, reconnectAttempts), 30000);
    const nextAttempt = reconnectAttempts + 1;
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${nextAttempt}/${maxReconnectAttempts})`);

    set({ connectionState: "reconnecting", reconnectAttempts: nextAttempt });

    const timer = setTimeout(() => {
      set({ reconnectTimer: null });
      get().connect();
    }, delay);

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
  const connectionState = useWebSocketStore(s => s.connectionState);
  const connect = useWebSocketStore(s => s.connect);
  const disconnect = useWebSocketStore(s => s.disconnect);
  const send = useWebSocketStore(s => s.send);

  return {
    connectionState,
    isConnected: connectionState === "connected",
    connect,
    disconnect,
    send,
  };
}
