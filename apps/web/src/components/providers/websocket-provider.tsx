'use client';

import { useEffect, ReactNode } from 'react';
import { useWebSocketStore } from '@/hooks/use-websocket';

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
  const { connect, disconnect, connectionState } = useWebSocketStore();

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

  // 在开发环境中显示连接状态
  if (process.env.NODE_ENV === 'development') {
    return (
      <>
        {children}
        <WebSocketStatusIndicator />
      </>
    );
  }

  return <>{children}</>;
}

/**
 * 开发环境下的 WebSocket 状态指示器
 */
function WebSocketStatusIndicator() {
  const { connectionState } = useWebSocketStore();

  const statusColors: Record<typeof connectionState, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    reconnecting: 'bg-orange-500',
    disconnected: 'bg-red-500',
  };

  const statusText: Record<typeof connectionState, string> = {
    connected: 'WS Connected',
    connecting: 'WS Connecting...',
    reconnecting: 'WS Reconnecting...',
    disconnected: 'WS Disconnected',
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-background/80 backdrop-blur border rounded-full shadow-lg text-xs">
      <div className={`w-2 h-2 rounded-full ${statusColors[connectionState]} ${connectionState !== 'connected' ? 'animate-pulse' : ''}`} />
      <span className="text-muted-foreground">{statusText[connectionState]}</span>
    </div>
  );
}
