"use client";

import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import type { PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
import type {
  PreviewBridgeController,
  PreviewTransportMode,
} from "../lib/preview-bridge/types";
import { getPreviewViewportBounds } from "../lib/preview-transports/desktop-transport";
import {
  PREVIEW_EXTENSION_REQUIRED_MESSAGE,
  PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
  canonicalizeUrl,
  createPreviewLoadError,
  type PreviewLoadError,
} from "../lib/preview-utils";

type PreviewTransportState = {
  mode: PreviewTransportMode | "unavailable";
  connected: boolean;
  message: string;
  capabilities: string[];
};

type UsePreviewLifecycleEffectsParams = {
  connectIframeTransport: (options?: {
    enterPickMode?: boolean;
    awaitHandshake?: boolean;
  }) => Promise<boolean>;
  desktopCommittedUrl: string;
  desktopPreviewViewportRef: MutableRefObject<string | null>;
  desktopCommittedUrlRef: MutableRefObject<string>;
  desktopViewportRef: RefObject<HTMLDivElement | null>;
  extensionConnectingRef: MutableRefObject<boolean>;
  hideDesktopPreview: () => Promise<void>;
  iframeKey: number;
  iframeSrc: string;
  iframeUrlWatcherCleanupRef: MutableRefObject<(() => void) | null>;
  isActive: boolean;
  isElementPickerEnabled: boolean;
  isMaximized: boolean;
  isPreviewLoading: boolean;
  navigationToken: number;
  preferredTransportMode: PreviewTransportMode | "unavailable";
  previewLoadError: PreviewLoadError | null;
  requestedIframeUrl: string;
  setDesktopCommittedUrl: (url: string) => void;
  setIframeKey: Dispatch<SetStateAction<number>>;
  setIframeSrc: (url: string) => void;
  setIsElementPickerEnabled: (enabled: boolean) => void;
  setIsPreviewLoading: (isLoading: boolean) => void;
  setPreviewLoadError: Dispatch<SetStateAction<PreviewLoadError | null>>;
  setTransportState: Dispatch<SetStateAction<PreviewTransportState>>;
  shouldSuspendDesktopPreview: boolean;
  showDesktopPreview: () => Promise<void>;
  syncDesktopPreview: () => Promise<void>;
  teardownTransport: (clearSelection?: boolean) => void;
  transportConnected: boolean;
  transportControllerRef: MutableRefObject<PreviewBridgeController | null>;
  viewMode: PreviewViewMode;
};

export function usePreviewLifecycleEffects({
  connectIframeTransport,
  desktopCommittedUrl,
  desktopPreviewViewportRef,
  desktopCommittedUrlRef,
  desktopViewportRef,
  extensionConnectingRef,
  hideDesktopPreview,
  iframeKey,
  iframeSrc,
  iframeUrlWatcherCleanupRef,
  isActive,
  isElementPickerEnabled,
  isMaximized,
  isPreviewLoading,
  navigationToken,
  preferredTransportMode,
  previewLoadError,
  requestedIframeUrl,
  setDesktopCommittedUrl,
  setIframeKey: _setIframeKey,
  setIframeSrc,
  setIsElementPickerEnabled,
  setIsPreviewLoading,
  setPreviewLoadError,
  setTransportState,
  shouldSuspendDesktopPreview,
  showDesktopPreview,
  syncDesktopPreview,
  teardownTransport,
  transportConnected,
  transportControllerRef,
  viewMode,
}: UsePreviewLifecycleEffectsParams) {
  const handledNavigationRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!requestedIframeUrl) return;

    const requestKey = `${navigationToken}:${requestedIframeUrl}`;
    const currentIframeUrl = canonicalizeUrl(iframeSrc) || iframeSrc.trim();
    const nextIframeUrl = canonicalizeUrl(requestedIframeUrl) || requestedIframeUrl.trim();
    const canReuseLoadedIframe =
      preferredTransportMode !== "desktop-native" &&
      navigationToken === 0 &&
      currentIframeUrl &&
      nextIframeUrl &&
      currentIframeUrl === nextIframeUrl;

    if (!isActive) {
      if (canReuseLoadedIframe) {
        handledNavigationRequestRef.current = requestKey;
      }
      return;
    }

    if (handledNavigationRequestRef.current === requestKey) return;
    handledNavigationRequestRef.current = requestKey;

    setPreviewLoadError(null);

    if (canReuseLoadedIframe) {
      return;
    }

    setIsPreviewLoading(true);

    if (preferredTransportMode === "desktop-native") {
      desktopCommittedUrlRef.current = requestedIframeUrl;
      setDesktopCommittedUrl(requestedIframeUrl);
      void syncDesktopPreview();
      return;
    }

    setIframeSrc(requestedIframeUrl);
    _setIframeKey((previous) => previous + 1);
  }, [
    _setIframeKey,
    desktopCommittedUrlRef,
    iframeSrc,
    isActive,
    navigationToken,
    preferredTransportMode,
    requestedIframeUrl,
    setDesktopCommittedUrl,
    setIframeSrc,
    setIsPreviewLoading,
    setPreviewLoadError,
    syncDesktopPreview,
  ]);

  useEffect(() => {
    if (
      !requestedIframeUrl ||
      !isActive ||
      preferredTransportMode === "desktop-native" ||
      !isPreviewLoading ||
      previewLoadError
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPreviewLoadError((previous) => previous ?? createPreviewLoadError(
        requestedIframeUrl,
        "Browser failed to load",
        "The new page never finished loading.",
        [
          "The URL may be invalid, the server may be down, or the browser may have rejected the navigation before committing a new document.",
        ],
      ));
      setIsPreviewLoading(false);
    }, 12000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isActive,
    isPreviewLoading,
    preferredTransportMode,
    previewLoadError,
    requestedIframeUrl,
    setIsPreviewLoading,
    setPreviewLoadError,
  ]);

  useEffect(() => {
    if (!iframeSrc) {
      setTransportState((previous) =>
        previous.mode === "unavailable" &&
        !previous.connected &&
        previous.message === "" &&
        previous.capabilities.length === 0
          ? previous
          : {
              mode: "unavailable",
              connected: false,
              message: "",
              capabilities: [],
            },
      );
      if (transportControllerRef.current) {
        teardownTransport();
      }
      return;
    }

    if (preferredTransportMode === "desktop-native") {
      setTransportState((previous) =>
        previous.mode === "desktop-native"
          ? previous
          : {
              ...previous,
              mode: "desktop-native",
              message: previous.message,
            },
      );
      if (isActive) {
        void syncDesktopPreview();
      } else {
        void hideDesktopPreview();
      }
      return;
    }

    if (transportControllerRef.current?.mode === "desktop-native") {
      teardownTransport(false);
    }

    setTransportState((previous) => {
      const nextConnected =
        preferredTransportMode === "extension" && previous.mode === "extension"
          ? previous.connected
          : false;
      const nextMessage =
        preferredTransportMode === "extension"
          ? previous.mode === "extension" && previous.connected
            ? ""
            : PREVIEW_EXTENSION_REQUIRED_MESSAGE
          : preferredTransportMode === "same-origin"
            ? ""
            : PREVIEW_SELECTION_UNAVAILABLE_MESSAGE;
      const nextCapabilities =
        preferredTransportMode === "extension" && previous.mode === "extension"
          ? previous.capabilities
          : [];
      const capabilitiesUnchanged =
        previous.capabilities === nextCapabilities ||
        (previous.capabilities.length === 0 && nextCapabilities.length === 0);

      if (
        previous.mode === preferredTransportMode &&
        previous.connected === nextConnected &&
        previous.message === nextMessage &&
        capabilitiesUnchanged
      ) {
        return previous;
      }

      return {
        mode: preferredTransportMode,
        connected: nextConnected,
        message: nextMessage,
        capabilities: nextCapabilities,
      };
    });
  }, [
    hideDesktopPreview,
    iframeKey,
    iframeSrc,
    isActive,
    preferredTransportMode,
    setTransportState,
    syncDesktopPreview,
    teardownTransport,
    transportControllerRef,
  ]);

  useEffect(() => {
    if (!isActive || !iframeSrc || preferredTransportMode !== "extension") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (
        transportControllerRef.current?.mode === "extension" &&
        (transportConnected || extensionConnectingRef.current)
      ) {
        return;
      }
      void connectIframeTransport({
        enterPickMode: isElementPickerEnabled,
        awaitHandshake: true,
      });
    }, 600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    connectIframeTransport,
    extensionConnectingRef,
    iframeKey,
    iframeSrc,
    isActive,
    isElementPickerEnabled,
    preferredTransportMode,
    transportConnected,
    transportControllerRef,
  ]);

  useEffect(() => {
    if (transportControllerRef.current?.mode === "desktop-native") return;

    if (!isElementPickerEnabled && transportControllerRef.current) {
      void Promise.resolve(transportControllerRef.current.exitPickMode());
    }

    if (preferredTransportMode !== "unavailable") {
      return;
    }

    if (transportControllerRef.current) {
      teardownTransport(false);
    }
    if (isElementPickerEnabled) {
      setIsElementPickerEnabled(false);
    }
  }, [
    iframeKey,
    iframeSrc,
    isElementPickerEnabled,
    preferredTransportMode,
    setIsElementPickerEnabled,
    teardownTransport,
    transportControllerRef,
  ]);

  useEffect(() => {
    if (preferredTransportMode !== "desktop-native") return;

    const surface = desktopViewportRef.current;
    if (!surface) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    const syncBounds = async () => {
      const controller = transportControllerRef.current;
      const currentSurface = desktopViewportRef.current;
      if (disposed || controller?.mode !== "desktop-native" || !currentSurface) return;
      const viewport = await getPreviewViewportBounds(currentSurface);
      if (disposed || transportControllerRef.current !== controller || desktopViewportRef.current !== currentSurface) return;
      await controller.updateViewport?.(viewport);
      if (disposed || transportControllerRef.current !== controller || desktopViewportRef.current !== currentSurface) return;
      desktopPreviewViewportRef.current = JSON.stringify(viewport);
    };

    resizeObserver = new ResizeObserver(() => {
      void syncBounds();
    });
    resizeObserver.observe(surface);
    window.addEventListener("resize", syncBounds);

    if (isTauriRuntime()) {
      void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        if (disposed) return;
        const currentWindow = getCurrentWindow();
        unlistenMoved = await currentWindow.onMoved(() => {
          void syncBounds();
        });
        if (disposed) { unlistenMoved(); unlistenMoved = undefined; return; }
        unlistenResized = await currentWindow.onResized(() => {
          void syncBounds();
        });
        if (disposed) { unlistenResized(); unlistenResized = undefined; }
      });
    }

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncBounds);
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, [desktopPreviewViewportRef, desktopViewportRef, preferredTransportMode, transportControllerRef]);

  useEffect(() => {
    if (
      preferredTransportMode !== "desktop-native" ||
      !isActive ||
      !desktopCommittedUrl ||
      shouldSuspendDesktopPreview
    ) return;

    let firstRafId = 0;
    let secondRafId = 0;
    let disposed = false;

    firstRafId = window.requestAnimationFrame(() => {
      secondRafId = window.requestAnimationFrame(async () => {
        if (
          disposed ||
          transportControllerRef.current?.mode !== "desktop-native" ||
          !desktopViewportRef.current
        ) return;

        const controller = transportControllerRef.current;
        const currentSurface = desktopViewportRef.current;
        if (controller?.mode !== "desktop-native" || !currentSurface) return;

        const viewport = await getPreviewViewportBounds(currentSurface);
        if (disposed || transportControllerRef.current !== controller || desktopViewportRef.current !== currentSurface) return;
        await controller.updateViewport?.(viewport);
        if (disposed || transportControllerRef.current !== controller || desktopViewportRef.current !== currentSurface) return;
        desktopPreviewViewportRef.current = JSON.stringify(viewport);
      });
    });

    return () => {
      disposed = true;
      if (firstRafId) window.cancelAnimationFrame(firstRafId);
      if (secondRafId) window.cancelAnimationFrame(secondRafId);
    };
  }, [
    desktopCommittedUrl,
    desktopPreviewViewportRef,
    desktopViewportRef,
    isActive,
    preferredTransportMode,
    shouldSuspendDesktopPreview,
    transportControllerRef,
    viewMode,
  ]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (
      preferredTransportMode !== "desktop-native" ||
      !isActive ||
      !desktopCommittedUrl ||
      shouldSuspendDesktopPreview
    ) {
      void hideDesktopPreview();
      return;
    }
    void showDesktopPreview();
  }, [
    desktopCommittedUrl,
    hideDesktopPreview,
    isActive,
    preferredTransportMode,
    shouldSuspendDesktopPreview,
    showDesktopPreview,
  ]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (
      preferredTransportMode !== "desktop-native" ||
      !isActive ||
      !desktopCommittedUrl ||
      shouldSuspendDesktopPreview
    ) return;

    let rafId = 0;
    const timeoutId = window.setTimeout(() => {
      rafId = window.requestAnimationFrame(() => {
        void showDesktopPreview();
      });
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [
    desktopCommittedUrl,
    isActive,
    isMaximized,
    preferredTransportMode,
    shouldSuspendDesktopPreview,
    showDesktopPreview,
  ]);

  useEffect(() => () => {
    teardownTransport(false);
    iframeUrlWatcherCleanupRef.current?.();
    iframeUrlWatcherCleanupRef.current = null;
  }, [iframeUrlWatcherCleanupRef, teardownTransport]);
}
