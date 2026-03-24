'use client';

import { isTauriRuntime } from './desktop-runtime';
import type { PreviewTransportViewport } from '@/components/run-preview/preview-bridge/types';

interface PreviewBridgeEventPayload {
  sessionId: string;
  pageUrl: string;
  pageTitle?: string;
  action?: 'copy';
  capabilities?: string[];
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  elementContext?: unknown;
  sourceLocation?: unknown;
  error?: string;
}

async function getInvoke() {
  const internals = (window as {
    __TAURI_INTERNALS__?: {
      invoke?: (cmd: string, payload?: unknown) => Promise<unknown>;
    };
  }).__TAURI_INTERNALS__;

  if (internals?.invoke) {
    return internals.invoke;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke;
}

export async function invokeDesktopPreviewBridge<T = unknown>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('Desktop preview bridge is only available in the Tauri runtime.');
  }

  const invoke = await getInvoke();
  return (await invoke(command, payload)) as T;
}

export async function listenDesktopPreviewBridge(
  eventName: string,
  handler: (payload: PreviewBridgeEventPayload) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<PreviewBridgeEventPayload>(eventName, (event) => {
    if (!event.payload) return;
    handler(event.payload);
  });
  return unlisten;
}

export async function getPreviewViewportBounds(element: HTMLElement): Promise<PreviewTransportViewport> {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}
