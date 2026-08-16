'use client';

import { useEffect, ReactNode, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { useAgentHooksStore } from '@/features/agent/store/agent-hooks-store';
import { useAgentNotifications } from '@/features/agent/hooks/use-agent-notifications';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { useAgentTitleSettingsStore } from '@/features/settings/store/agent-title-settings-store';
import { useAgentActivityIndicatorSettingsStore } from '@/features/settings/store/agent-activity-indicator-settings-store';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';
import { useHostedConnectionStore } from '@/features/connection/store/hosted-connection-store';
import { isHostedAtmosOrigin, isPublicTokPath } from '@/shared/lib/desktop-runtime';
import {
  subscribeToWorkspaceDeleteProgress,
  subscribeToWorkspaceGitignoreSyncFailed,
  subscribeToWorkspaceSetupProgress,
} from '@/features/project/store/use-project-store';
import { ensureProjectBootstrap } from '@/features/project/hooks/use-project-bootstrap-query';
import { getAtmosWebQueryClient } from '@/providers/app/query-client';
import { getComputerQueryScope } from '@/api/query/query-scope';
import { invalidateAfterComputerReconnect } from '@/api/query/reconnect-invalidation';

interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * WebSocket Provider
 *
 * 在应用启动时自动建立 WebSocket 连接，并在整个应用生命周期中保持连接。
 * 提供自动重连和心跳检测功能。
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const connect = useWebSocketStore(s => s.connect);
  const disconnect = useWebSocketStore(s => s.disconnect);
  const connectionState = useWebSocketStore(s => s.connectionState);
  const hostedBootstrapState = useHostedConnectionStore(s => s.bootstrapState);
  const pathname = usePathname();
  const shouldConnect =
    !isPublicTokPath(pathname) &&
    (!isHostedAtmosOrigin() || hostedBootstrapState === 'connected');
  const prevConnectionStateRef = useRef(connectionState);

  useEffect(() => {
    if (!shouldConnect) {
      disconnect();
      return;
    }

    // Bootstrap / target-switch may cancel an in-flight connect; that is not a failure.
    void connect().catch(() => undefined);

    // 页面可见性变化时的处理
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面变为可见时，检查并重新连接
        const state = useWebSocketStore.getState();
        if (shouldConnect && state.connectionState === 'disconnected') {
          void connect().catch(() => undefined);
        }
      }
    };

    // 网络状态变化时的处理
    const handleOnline = () => {
      const state = useWebSocketStore.getState();
      if (shouldConnect && state.connectionState === 'disconnected') {
        void connect().catch(() => undefined);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    // 清理函数
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      // 注意：不在这里调用 disconnect()，因为这可能只是组件重新渲染
      // 真正的断开连接应该在用户明确登出或关闭页面时
    };
  }, [connect, disconnect, shouldConnect]);

  useEffect(() => {
    const unsubscribeSetup = subscribeToWorkspaceSetupProgress();
    const unsubscribeDelete = subscribeToWorkspaceDeleteProgress();
    const unsubscribeGitignore = subscribeToWorkspaceGitignoreSyncFailed();
    return () => {
      unsubscribeSetup();
      unsubscribeDelete();
      unsubscribeGitignore();
    };
  }, []);

  useEffect(() => {
    // init() is idempotent — it checks _unsubscribe internally.
    // We call it once the WS is connected and never cleanup, because
    // the event listener persists across reconnections (same Map ref).
    if (connectionState === 'connected') {
      useAgentHooksStore.getState().init();
      useLayoutSettingsStore.getState().loadSettings();
      void useExperimentSettingsStore.getState().loadSettings();
      void useAgentTitleSettingsStore.getState().loadSettings();
      void useAgentActivityIndicatorSettingsStore.getState().loadSettings();
      // Project bootstrap is now Query-owned; reconnect invalidation handles refresh.
      void ensureProjectBootstrap().catch(() => undefined);
    }
  }, [connectionState]);

  // APP-035: same-target reconnect → invalidate registered Query roots once.
  useEffect(() => {
    const prev = prevConnectionStateRef.current;
    prevConnectionStateRef.current = connectionState;
    if (connectionState !== 'connected') return;
    if (prev === 'connected') return;
    // Transition into connected from connecting/reconnecting/disconnected.
    void invalidateAfterComputerReconnect(
      getAtmosWebQueryClient(),
      getComputerQueryScope(),
    );
  }, [connectionState]);

  useAgentNotifications();

  return <>{children}</>;
}
