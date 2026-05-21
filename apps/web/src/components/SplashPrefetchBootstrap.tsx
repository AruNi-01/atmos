'use client';

import { useEffect } from 'react';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import { useProjectStore } from '@/hooks/use-project-store';

/**
 * While the splash screen is visible, the hidden main webview already loads the app.
 * Kick off connection bootstrap + WS + project fetch as early as possible.
 */
export function SplashPrefetchBootstrap() {
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void (async () => {
      const { waitForWebSocketConnection } = await import('@/hooks/use-websocket');
      await waitForWebSocketConnection();
      const { projects, isLoading } = useProjectStore.getState();
      if (projects.length === 0 && !isLoading) {
        await useProjectStore.getState().fetchProjects();
      }
    })().catch((err) => {
      console.warn('[SplashPrefetchBootstrap] prefetch failed:', err);
    });
  }, []);

  return null;
}
