"use client";

import { useCallback } from "react";
import type { MutableRefObject, RefObject } from "react";

import type {
  PreviewBridgeController,
  PreviewTransportMode,
} from "../lib/preview-bridge/types";
import {
  canonicalizeUrl,
  detectBrowserErrorDocument,
  type PreviewLoadError,
} from "../lib/preview-utils";

type PreviewIframeAccess = {
  iframe: HTMLIFrameElement;
  frameWindow: Window;
  frameDocument: Document;
};

type UsePreviewIframeLoadParams = {
  connectIframeTransport: (options?: {
    enterPickMode?: boolean;
    awaitHandshake?: boolean;
  }) => Promise<boolean>;
  iframeLoadResolveRef: MutableRefObject<(() => void) | null>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  iframeSrc: string;
  iframeUrlWatcherCleanupRef: MutableRefObject<(() => void) | null>;
  isActive: boolean;
  isElementPickerEnabled: boolean;
  normalizedActiveUrlRef: MutableRefObject<string>;
  preferredTransportMode: PreviewTransportMode | "unavailable";
  pushHistoryEntry: (url: string) => void;
  setActiveUrl: (url: string) => void;
  setCurrentPageTitle: (title: string) => void;
  setIsPreviewLoading: (isLoading: boolean) => void;
  setPreviewLoadError: (error: PreviewLoadError | null) => void;
  setUrl: (url: string) => void;
  skipExternalHistorySyncRef: MutableRefObject<boolean>;
  syncSameOriginPreviewAccess: () => PreviewIframeAccess | null;
  transportControllerRef: MutableRefObject<PreviewBridgeController | null>;
};

export function usePreviewIframeLoad({
  connectIframeTransport,
  iframeLoadResolveRef,
  iframeRef,
  iframeSrc,
  iframeUrlWatcherCleanupRef,
  isActive,
  isElementPickerEnabled,
  normalizedActiveUrlRef,
  preferredTransportMode,
  pushHistoryEntry,
  setActiveUrl,
  setCurrentPageTitle,
  setIsPreviewLoading,
  setPreviewLoadError,
  setUrl,
  skipExternalHistorySyncRef,
  syncSameOriginPreviewAccess,
  transportControllerRef,
}: UsePreviewIframeLoadParams) {
  return useCallback(() => {
    setIsPreviewLoading(false);

    const shouldSkipHistoryPush = skipExternalHistorySyncRef.current;
    skipExternalHistorySyncRef.current = false;

    iframeUrlWatcherCleanupRef.current?.();
    iframeUrlWatcherCleanupRef.current = null;

    try {
      const iframeWindow = iframeRef.current?.contentWindow;
      const iframeDocument = iframeRef.current?.contentDocument;
      const detectedError = iframeWindow && iframeDocument
        ? detectBrowserErrorDocument(
            iframeWindow.location.href || iframeSrc,
            iframeDocument.title?.trim() ?? "",
            iframeDocument.body?.innerText ?? "",
          )
        : null;
      setPreviewLoadError(detectedError);
      if (detectedError) {
        setCurrentPageTitle(detectedError.title);
      }
    } catch {
      // Cross-origin frames are not inspectable here. Keep any error state
      // already established by the outer probes instead of clearing it.
    }

    if (preferredTransportMode === "same-origin") {
      syncSameOriginPreviewAccess();
      try {
        const iframeWin = iframeRef.current?.contentWindow;
        if (iframeWin) {
          const iframeUrl = iframeWin.location.href;
          const iframeTitle = iframeWin.document.title?.trim() ?? "";
          setCurrentPageTitle(iframeTitle);
          if (canonicalizeUrl(iframeUrl) !== normalizedActiveUrlRef.current) {
            setUrl(iframeUrl);
            setActiveUrl(iframeUrl);
            if (!shouldSkipHistoryPush) {
              pushHistoryEntry(iframeUrl);
            }
          }

          let lastWatchedPath = iframeWin.location.pathname + iframeWin.location.hash;

          const pollId = window.setInterval(() => {
            try {
              const currentPath = iframeWin.location.pathname + iframeWin.location.hash;
              if (currentPath === lastWatchedPath) return;
              lastWatchedPath = currentPath;
              const currentUrl = iframeWin.location.href;
              if (transportControllerRef.current) return;
              const currentTitle = iframeWin.document.title?.trim() ?? "";
              setUrl(currentUrl);
              setActiveUrl(currentUrl);
              setCurrentPageTitle(currentTitle);
              pushHistoryEntry(currentUrl);
            } catch {
              window.clearInterval(pollId);
            }
          }, 260);

          iframeUrlWatcherCleanupRef.current = () => {
            window.clearInterval(pollId);
          };
        }
      } catch {
        // Cross-origin — cannot read iframe URL
      }
    } else {
      setCurrentPageTitle("");
      if (isActive && preferredTransportMode === "extension") {
        void connectIframeTransport({
          enterPickMode: isElementPickerEnabled,
          awaitHandshake: false,
        });
      }
    }

    if (iframeLoadResolveRef.current) {
      const resolve = iframeLoadResolveRef.current;
      iframeLoadResolveRef.current = null;
      resolve();
      return;
    }
  }, [
    connectIframeTransport,
    iframeLoadResolveRef,
    iframeRef,
    iframeSrc,
    iframeUrlWatcherCleanupRef,
    isActive,
    isElementPickerEnabled,
    normalizedActiveUrlRef,
    preferredTransportMode,
    pushHistoryEntry,
    setActiveUrl,
    setCurrentPageTitle,
    setIsPreviewLoading,
    setPreviewLoadError,
    setUrl,
    skipExternalHistorySyncRef,
    syncSameOriginPreviewAccess,
    transportControllerRef,
  ]);
}
