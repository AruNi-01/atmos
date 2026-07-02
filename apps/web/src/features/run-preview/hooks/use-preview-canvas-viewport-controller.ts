"use client";

import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from "react";

import type { PreviewTransportMode } from "../lib/preview-bridge/types";

export interface PreviewCanvasViewportController {
  syncViewport: () => void;
  hide: () => void;
}

interface UsePreviewCanvasViewportControllerParams {
  canvasViewportControllerRef?: MutableRefObject<PreviewCanvasViewportController | null>;
  desktopCommittedUrlRef: MutableRefObject<string>;
  desktopViewportRef: RefObject<HTMLElement | null>;
  hideDesktopPreview: () => Promise<void>;
  preferredTransportMode: PreviewTransportMode | "unavailable";
  shouldSuspendDesktopPreview: boolean;
  showDesktopPreview: () => Promise<void>;
}

export function usePreviewCanvasViewportController({
  canvasViewportControllerRef,
  desktopCommittedUrlRef,
  desktopViewportRef,
  hideDesktopPreview,
  preferredTransportMode,
  shouldSuspendDesktopPreview,
  showDesktopPreview,
}: UsePreviewCanvasViewportControllerParams): void {
  const syncInFlightRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const syncRafRef = useRef<number | null>(null);
  const syncRequesterRef = useRef<(() => void) | null>(null);

  const runCanvasViewportSync = useCallback(async () => {
    if (
      preferredTransportMode !== "desktop-native" ||
      !desktopCommittedUrlRef.current ||
      shouldSuspendDesktopPreview
    ) {
      await hideDesktopPreview();
      return;
    }

    const surface = desktopViewportRef.current;
    if (!surface) {
      await hideDesktopPreview();
      return;
    }

    const rect = surface.getBoundingClientRect();
    const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    if (rect.width < 16 || rect.height < 16 || visibleWidth < 8 || visibleHeight < 8) {
      await hideDesktopPreview();
      return;
    }

    await showDesktopPreview();
  }, [
    desktopCommittedUrlRef,
    desktopViewportRef,
    hideDesktopPreview,
    preferredTransportMode,
    shouldSuspendDesktopPreview,
    showDesktopPreview,
  ]);

  const syncCanvasViewport = useCallback(() => {
    if (syncInFlightRef.current) {
      syncQueuedRef.current = true;
      return;
    }

    syncInFlightRef.current = true;
    void (async () => {
      try {
        await runCanvasViewportSync();
      } finally {
        syncInFlightRef.current = false;
        if (!syncQueuedRef.current) return;

        syncQueuedRef.current = false;
        if (syncRafRef.current != null) {
          window.cancelAnimationFrame(syncRafRef.current);
        }
        syncRafRef.current = window.requestAnimationFrame(() => {
          syncRafRef.current = null;
          syncRequesterRef.current?.();
        });
      }
    })().catch(() => undefined);
  }, [runCanvasViewportSync]);

  syncRequesterRef.current = syncCanvasViewport;

  useEffect(() => {
    return () => {
      if (syncRafRef.current != null) {
        window.cancelAnimationFrame(syncRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!canvasViewportControllerRef) return;

    const controller: PreviewCanvasViewportController = {
      syncViewport: syncCanvasViewport,
      hide: () => {
        void hideDesktopPreview();
      },
    };
    canvasViewportControllerRef.current = controller;
    syncCanvasViewport();

    return () => {
      if (canvasViewportControllerRef.current === controller) {
        canvasViewportControllerRef.current = null;
      }
    };
  }, [canvasViewportControllerRef, hideDesktopPreview, syncCanvasViewport]);
}
