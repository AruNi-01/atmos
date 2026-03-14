'use client';

import { useEffect, ReactNode } from 'react';
import { useWebSocketStore } from '@/hooks/use-websocket';
import { subscribeToWorkspaceSetupProgress } from '@/hooks/use-project-store';

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

  useEffect(() => {
    // 应用启动时建立连接
    connect();

    // 页面可见性变化时的处理
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面变为可见时，检查并重新连接
        const state = useWebSocketStore.getState();
        if (state.connectionState === 'disconnected') {
          connect();
        }
      }
    };

    // 网络状态变化时的处理
    const handleOnline = () => {
      const state = useWebSocketStore.getState();
      if (state.connectionState === 'disconnected') {
        connect();
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
  }, [connect]);

  useEffect(() => {
    const unsubscribe = subscribeToWorkspaceSetupProgress();
    return unsubscribe;
  }, []);

  return <>{children}</>;
}
