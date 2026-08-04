"use client";

import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import { isDesktopRuntime, isTauriRuntime } from "@/shared/lib/desktop-runtime";
import type { PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
import type {
  BrowserBridgeController,
  BrowserTransportMode,
} from "../lib/browser-bridge/types";
import {
  PREVIEW_EXTENSION_REQUIRED_MESSAGE,
  PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
  canonicalizeUrl,
  createPreviewLoadError,
  type PreviewLoadError,
} from "../lib/browser-utils";

type PreviewTransportState = {
  mode: BrowserTransportMode | "unavailable";
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
  preferredTransportMode: BrowserTransportMode | "unavailable";
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
  transportControllerRef: MutableRefObject<BrowserBridgeController | null>;
  viewMode: PreviewViewMode;
};

export function useBrowserLifecycleEffects({
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
      preferredTransportMode !== "desktop" &&
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

    if (preferredTransportMode === "desktop") {
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
      preferredTransportMode === "desktop" ||
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

    if (preferredTransportMode === "desktop") {
      setTransportState((previous) =>
        previous.mode === "desktop"
          ? previous
          : {
              ...previous,
              mode: "desktop",
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

    if (transportControllerRef.current?.mode === "desktop") {
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

  // Keep pick mode aligned with this tab only (each browser tab has its own Preview).
  useEffect(() => {
    const controller = transportControllerRef.current;
    if (!controller) return;

    if (!isActive) {
      // Hidden tabs should not intercept pointer events in pick mode.
      if (isElementPickerEnabled) {
        void Promise.resolve(controller.exitPickMode());
      }
      return;
    }

    if (isElementPickerEnabled) {
      void Promise.resolve(controller.enterPickMode());
    } else {
      void Promise.resolve(controller.exitPickMode());
    }
  }, [isActive, isElementPickerEnabled, transportControllerRef]);

  useEffect(() => {
    if (transportControllerRef.current?.mode === "desktop") return;

    if (preferredTransportMode !== "unavailable") {
      return;
    }

    if (transportControllerRef.current) {
      teardownTransport(false);
    }
    // Clear only this tab's local pick state when active and transport is gone
    // (e.g. empty URL). Other tabs keep their own pick state.
    if (isElementPickerEnabled && isActive) {
      setIsElementPickerEnabled(false);
    }
  }, [
    iframeKey,
    iframeSrc,
    isActive,
    isElementPickerEnabled,
    preferredTransportMode,
    setIsElementPickerEnabled,
    teardownTransport,
    transportControllerRef,
  ]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    if (preferredTransportMode !== "desktop" || !isActive || !desktopCommittedUrl) {
      return;
    }
    void syncDesktopPreview();
  }, [
    desktopCommittedUrl,
    isActive,
    preferredTransportMode,
    syncDesktopPreview,
  ]);

  useEffect(() => () => {
    teardownTransport(false);
    iframeUrlWatcherCleanupRef.current?.();
    iframeUrlWatcherCleanupRef.current = null;
  }, [iframeUrlWatcherCleanupRef, teardownTransport]);
}
