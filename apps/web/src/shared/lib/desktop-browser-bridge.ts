'use client';

import { desktopInvoke, desktopListen, isDesktopRuntime } from './desktop-bridge';
import type { BrowserTransportViewport } from '@/features/browser/lib/browser-bridge/types';

interface PreviewBridgeEventPayload {
  sessionId: string;
  pageUrl: string;
  pageTitle?: string;
  faviconUrl?: string;
  targetUrl?: string;
  action?: 'copy' | 'add' | 'update' | 'delete';
  tabAction?: 'open' | 'close' | 'select' | 'list';
  requestId?: string;
  targetId?: string;
  url?: string;
  annotationId?: string;
  note?: string;
  capabilities?: string[];
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cursor?: {
    x: number;
    y: number;
  };
  viewport?: {
    width: number;
    height: number;
  };
  elementContext?: unknown;
  sourceLocation?: unknown;
  /** Present on toolbar-action when the runtime includes a selection snapshot. */
  error?: string;
}

export async function invokeDesktopBrowserBridge<T = unknown>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  if (!isDesktopRuntime()) {
    throw new Error('Desktop Browser bridge is only available in a desktop shell.');
  }
  return desktopInvoke<T>(command, payload);
}

export async function listenDesktopBrowserBridge(
  eventName: string,
  handler: (payload: PreviewBridgeEventPayload) => void,
): Promise<() => void> {
  return desktopListen(eventName, (payload) => {
    if (!payload) return;
    handler(payload as PreviewBridgeEventPayload);
  });
}

export async function getBrowserViewportBounds(element: HTMLElement): Promise<BrowserTransportViewport> {
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
