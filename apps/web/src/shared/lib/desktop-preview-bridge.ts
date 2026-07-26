'use client';

import { isTauriRuntime } from './desktop-runtime';
import type { PreviewTransportViewport } from '@/features/run-preview/lib/preview-bridge/types';

interface PreviewBridgeEventPayload {
  sessionId: string;
  pageUrl: string;
  pageTitle?: string;
  faviconUrl?: string;
  targetUrl?: string;
  action?: 'copy' | 'add' | 'update' | 'delete';
  annotationId?: string;
  note?: string;
  capabilities?: string[];
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  elementContext?: unknown;
  sourceLocation?: unknown;
  /** Present on toolbar-action when the runtime includes a selection snapshot. */
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
    throw new Error('Desktop Browser bridge is only available in the Tauri runtime.');
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
  const rawScale =
    element.offsetWidth > 0
      ? rect.width / element.offsetWidth
      : element.offsetHeight > 0
        ? rect.height / element.offsetHeight
        : 1;
  const zoom = Number.isFinite(rawScale)
    ? Math.min(10, Math.max(0.2, rawScale))
    : 1;
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    zoom: Math.round(zoom * 1000) / 1000,
  };
}
