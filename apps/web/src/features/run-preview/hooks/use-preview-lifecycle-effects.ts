"use client";

import { useEffect } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import { invokeDesktopPreviewBridge } from "@/shared/lib/desktop-preview-bridge";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import type {
  PreviewBridgeController,
  PreviewTransportMode,
} from "../lib/preview-bridge/types";
import { getPreviewViewportBounds } from "../lib/preview-transports/desktop-transport";
import {
  PREVIEW_EXTENSION_REQUIRED_MESSAGE,
  PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
  createPreviewLoadError,
  createPreviewNetworkError,
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
};

export function usePreviewLifecycleEffects({
  connectIframeTransport,
  desktopCommittedUrl,
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
}: UsePreviewLifecycleEffectsParams) {
  useEffect(() => {
    if (!requestedIframeUrl || !isActive) return;

    setPreviewLoadError(null);
    setIsPreviewLoading(true);

    if (preferredTransportMode === "desktop-native") {
      void hideDesktopPreview();

      let disposed = false;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, 4500);

      void invokeDesktopPreviewBridge("preview_bridge_probe_url", {
        url: requestedIframeUrl,
      }).then(() => {
        if (disposed) return;
        desktopCommittedUrlRef.current = requestedIframeUrl;
        setDesktopCommittedUrl(requestedIframeUrl);
      }).catch((error) => {
        if (disposed) return;
        desktopCommittedUrlRef.current = "";
        setDesktopCommittedUrl("");
        void hideDesktopPreview();
        setPreviewLoadError(createPreviewNetworkError(requestedIframeUrl, error));
        setIsPreviewLoading(false);
      });

      return () => {
        disposed = true;
        window.clearTimeout(timeoutId);
        controller.abort();
      };
    }

    setIframeSrc(requestedIframeUrl);
    _setIframeKey((previous) => previous + 1);
  }, [
    _setIframeKey,
    desktopCommittedUrlRef,
    hideDesktopPreview,
    isActive,
    navigationToken,
    preferredTransportMode,
    requestedIframeUrl,
    setDesktopCommittedUrl,
    setIframeSrc,
    setIsPreviewLoading,
    setPreviewLoadError,
  ]);

  useEffect(() => {
    if (
      !requestedIframeUrl ||
      !isActive ||
      !isPreviewLoading ||
      previewLoadError
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPreviewLoadError((previous) => previous ?? createPreviewLoadError(
        requestedIframeUrl,
        "Preview failed to load",
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
  }, [isActive, isPreviewLoading, previewLoadError, requestedIframeUrl, setIsPreviewLoading, setPreviewLoadError]);

  useEffect(() => {
    if (!iframeSrc) {
      setTransportState({
        mode: "unavailable",
        connected: false,
        message: "",
        capabilities: [],
      });
      teardownTransport();
      return;
    }

    if (preferredTransportMode === "desktop-native") {
      setTransportState((previous) => ({
        ...previous,
        mode: "desktop-native",
        message: previous.message,
      }));
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

    setTransportState((previous) => ({
      mode: preferredTransportMode,
      connected:
        preferredTransportMode === "extension" && previous.mode === "extension"
          ? previous.connected
          : false,
      message:
        preferredTransportMode === "extension"
          ? previous.mode === "extension" && previous.connected
            ? ""
            : PREVIEW_EXTENSION_REQUIRED_MESSAGE
          : preferredTransportMode === "same-origin"
            ? ""
            : PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
      capabilities:
        preferredTransportMode === "extension" && previous.mode === "extension"
          ? previous.capabilities
          : [],
    }));
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
    teardownTransport(false);
    if (preferredTransportMode !== "extension") {
      setIsElementPickerEnabled(false);
    }
  }, [iframeKey, iframeSrc, preferredTransportMode, setIsElementPickerEnabled, teardownTransport, transportControllerRef]);

  useEffect(() => {
    if (preferredTransportMode !== "desktop-native") return;

    const surface = desktopViewportRef.current;
    if (!surface) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    const syncBounds = async () => {
      if (disposed || transportControllerRef.current?.mode !== "desktop-native" || !desktopViewportRef.current) return;
      await transportControllerRef.current.updateViewport?.(await getPreviewViewportBounds(desktopViewportRef.current));
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
  }, [desktopViewportRef, preferredTransportMode, transportControllerRef]);

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
