'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Extension } from '@codemirror/state';
import { lspWsApi, type LspStatusResponse } from '@/api/ws-api';
import { useWebSocketStore } from '@/hooks/use-websocket';
import {
  acquireCodeMirrorLspExtension,
  lspLanguageId,
  resetCodeMirrorLspChannel,
} from '@/lib/codemirror-lsp';

const EMPTY_EXTENSION: Extension = [];
const DEFAULT_STATUS: LspStatusResponse = {
  server_id: null,
  server_name: null,
  status: 'unavailable',
};

function describeLspError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'failed to initialize lsp client';
  }
}

function isRecoverableConnectError(error: unknown): boolean {
  const message = describeLspError(error);
  return (
    message.includes('Request timeout: lsp_connect_for_file') ||
    message.includes('WebSocket not connected') ||
    message.includes('WebSocket connection closed') ||
    message.includes('WebSocket disconnected')
  );
}

async function reconnectWebSocket(): Promise<void> {
  const ws = useWebSocketStore.getState();
  ws.disconnect();
  await ws.connect();
}

async function connectForFileWithRetry(
  filePath: string,
  workspaceRoot: string,
): Promise<LspStatusResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await lspWsApi.connectForFile(filePath, workspaceRoot);
    } catch (error) {
      lastError = error;
      if (!isRecoverableConnectError(error) || attempt === 2) {
        throw error;
      }

      await reconnectWebSocket().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError ?? new Error('failed to connect lsp runtime');
}

async function waitForRunningStatus(
  filePath: string,
  workspaceRoot: string,
  initialStatus: LspStatusResponse,
  onUpdate: (status: LspStatusResponse) => void,
): Promise<LspStatusResponse> {
  let latest = initialStatus;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (latest.status === 'running' || latest.status === 'error' || latest.status === 'unavailable') {
      return latest;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    latest = await lspWsApi.statusForFile(filePath, workspaceRoot);
    onUpdate(latest);
  }

  return latest;
}

export function useCodeMirrorLsp(params: {
  filePath: string;
  language: string;
  workspaceRoot: string | null;
  hasHydrated: boolean;
  enabled: boolean;
}) {
  const { filePath, language, workspaceRoot, hasHydrated, enabled } = params;
  const [extension, setExtension] = useState<Extension>(EMPTY_EXTENSION);
  const [status, setStatus] = useState<LspStatusResponse>(DEFAULT_STATUS);
  const [reloadToken, setReloadToken] = useState(0);
  const releaseRef = useRef<null | (() => Promise<void>)>(null);
  const channelIdRef = useRef<string | null>(null);

  const cleanupBinding = useCallback(async () => {
    const release = releaseRef.current;
    releaseRef.current = null;
    channelIdRef.current = null;
    setExtension(EMPTY_EXTENSION);
    if (release) {
      await release();
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated || !workspaceRoot || !enabled) {
      void cleanupBinding();
      setStatus(DEFAULT_STATUS);
      return;
    }

    let cancelled = false;
    let healthTimer: ReturnType<typeof setInterval> | null = null;

    const bootstrap = async () => {
      await cleanupBinding();
      const initialStatus = await lspWsApi.statusForFile(filePath, workspaceRoot).catch(
        () => DEFAULT_STATUS
      );
      if (cancelled) return;

      setStatus({
        ...initialStatus,
        status: 'starting',
        error: undefined,
      });

      const connection = await connectForFileWithRetry(filePath, workspaceRoot);
      if (cancelled) return;
      setStatus(connection);

      if (!connection.channel_id) {
        return;
      }

      const ready = await waitForRunningStatus(filePath, workspaceRoot, connection, (latest) => {
        if (!cancelled) setStatus(latest);
      });
      if (cancelled) return;

      setStatus(ready);
      if (ready.status !== 'running' || !ready.channel_id) {
        return;
      }

      const binding = await acquireCodeMirrorLspExtension({
        channelId: ready.channel_id,
        workspaceRoot,
        filePath,
        languageId: lspLanguageId(language),
      });
      if (cancelled) {
        await binding.release();
        return;
      }

      releaseRef.current = binding.release;
      channelIdRef.current = ready.channel_id;
      setExtension(binding.extension);

      healthTimer = setInterval(() => {
        void lspWsApi.statusForFile(filePath, workspaceRoot).then(async (latest) => {
          if (cancelled) return;
          setStatus(latest);
          if (latest.status === 'running') return;
          await cleanupBinding();
        }).catch(() => {});
      }, 10000);
    };

    void bootstrap().catch(async (error) => {
      if (!cancelled) {
        await cleanupBinding();
        setStatus((current) => ({
          ...current,
          status: 'error',
          error: describeLspError(error),
        }));
      }
    });

    return () => {
      cancelled = true;
      if (healthTimer) clearInterval(healthTimer);
      void cleanupBinding();
    };
  }, [cleanupBinding, enabled, filePath, hasHydrated, language, reloadToken, workspaceRoot]);

  const restart = useCallback(async () => {
    const channelId = channelIdRef.current;
    if (channelId) {
      await resetCodeMirrorLspChannel(channelId);
    }
    if (workspaceRoot) {
      const nextStatus = await lspWsApi.restartForFile(filePath, workspaceRoot);
      setStatus(nextStatus);
    }
    setReloadToken((value) => value + 1);
  }, [filePath, workspaceRoot]);

  return {
    extension,
    status,
    restart,
  };
}
