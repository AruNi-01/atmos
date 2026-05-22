import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';

import { isTauriRuntime } from '@/lib/desktop-runtime';
import type {
  PreviewBridgeController,
  PreviewTransportMode,
} from './preview-bridge/types';
import {
  MAX_HISTORY_LENGTH,
  canonicalizeUrl,
  normalizeUrl,
  type PreviewLoadError,
} from './preview-utils';

interface UsePreviewNavigationParams {
  activeUrl: string;
  desktopCommittedUrlRef: MutableRefObject<string>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  iframeUrlWatcherCleanupRef: MutableRefObject<(() => void) | null>;
  normalizedActiveUrlRef: MutableRefObject<string>;
  preferredTransportMode: PreviewTransportMode | 'unavailable';
  setActiveUrl: (url: string) => void;
  setCurrentPageTitle: (title: string) => void;
  setDesktopCommittedUrl: (url: string) => void;
  setIframeSrc: (url: string) => void;
  setIsElementPickerEnabled: (enabled: boolean) => void;
  setIsUrlInputFocused: (focused: boolean) => void;
  setNavigationToken: Dispatch<SetStateAction<number>>;
  setPreviewLoadError: (error: PreviewLoadError | null) => void;
  setRequestedIframeUrl: (url: string) => void;
  setUrl: (url: string) => void;
  teardownTransport: (clearSelection?: boolean) => void;
  transportControllerRef: MutableRefObject<PreviewBridgeController | null>;
  url: string;
  urlInputRef: RefObject<HTMLInputElement | null>;
}

export function usePreviewNavigation({
  activeUrl,
  desktopCommittedUrlRef,
  iframeRef,
  iframeUrlWatcherCleanupRef,
  normalizedActiveUrlRef,
  preferredTransportMode,
  setActiveUrl,
  setCurrentPageTitle,
  setDesktopCommittedUrl,
  setIframeSrc,
  setIsElementPickerEnabled,
  setIsUrlInputFocused,
  setNavigationToken,
  setPreviewLoadError,
  setRequestedIframeUrl,
  setUrl,
  teardownTransport,
  transportControllerRef,
  url,
  urlInputRef,
}: UsePreviewNavigationParams) {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);
  const skipExternalHistorySyncRef = useRef(false);
  const userEditedUrlRef = useRef(false);

  const clampedHistoryIndex = Math.max(0, Math.min(historyIndex, history.length - 1));
  const canGoBack = clampedHistoryIndex > 0;
  const canGoForward = clampedHistoryIndex < history.length - 1;

  const pushHistoryEntry = useCallback((finalUrl: string) => {
    setHistory((prev) => {
      const rawIndex = historyIndexRef.current;
      const currentIndex = Math.max(0, Math.min(rawIndex, prev.length - 1));
      const nextHistory = [...prev.slice(0, currentIndex + 1), finalUrl];

      if (nextHistory.length > MAX_HISTORY_LENGTH) {
        const drop = nextHistory.length - MAX_HISTORY_LENGTH;
        const nextIndex = currentIndex + 1 - drop;
        historyIndexRef.current = nextIndex;
        setHistoryIndex(nextIndex);
        return nextHistory.slice(drop);
      }

      const nextIndex = currentIndex + 1;
      historyIndexRef.current = nextIndex;
      setHistoryIndex(nextIndex);
      return nextHistory;
    });
  }, []);

  const navigateToUrl = useCallback(
    (nextValue: string, pushHistory = true) => {
      const finalUrl = normalizeUrl(nextValue);
      if (!finalUrl) return;

      setIsUrlInputFocused(false);
      if (canonicalizeUrl(finalUrl) !== normalizedActiveUrlRef.current) {
        setCurrentPageTitle('');
      }
      setPreviewLoadError(null);
      skipExternalHistorySyncRef.current = true;
      setUrl(finalUrl);
      setActiveUrl(finalUrl);
      setRequestedIframeUrl(finalUrl);
      setNavigationToken((prev) => prev + 1);
      if (isTauriRuntime()) {
        desktopCommittedUrlRef.current = '';
        setDesktopCommittedUrl('');
      }

      if (!pushHistory) return;
      pushHistoryEntry(finalUrl);
    },
    [
      desktopCommittedUrlRef,
      normalizedActiveUrlRef,
      pushHistoryEntry,
      setActiveUrl,
      setCurrentPageTitle,
      setDesktopCommittedUrl,
      setIsUrlInputFocused,
      setNavigationToken,
      setPreviewLoadError,
      setRequestedIframeUrl,
      setUrl,
    ],
  );

  const focusUrlInput = useCallback(() => {
    userEditedUrlRef.current = false;
    setIsUrlInputFocused(true);
    window.requestAnimationFrame(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    });
  }, [setIsUrlInputFocused, urlInputRef]);

  const handleUrlInputBlur = useCallback(() => {
    const edited = userEditedUrlRef.current;
    userEditedUrlRef.current = false;
    setIsUrlInputFocused(false);
    if (edited) {
      setUrl(activeUrl);
    }
  }, [activeUrl, setIsUrlInputFocused, setUrl]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    if (!activeUrl) return;
    if (history.length > 0) return;
    setHistory([activeUrl]);
    historyIndexRef.current = 0;
    setHistoryIndex(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- seed history once on mount
  }, [activeUrl]);

  const handleRefresh = useCallback(() => {
    if (!url) return;
    navigateToUrl(url);
  }, [navigateToUrl, url]);

  const handleGoHome = useCallback(() => {
    setUrl('');
    setActiveUrl('');
    setCurrentPageTitle('');
    setIsElementPickerEnabled(false);
    setPreviewLoadError(null);
    setRequestedIframeUrl('');
    desktopCommittedUrlRef.current = '';
    setDesktopCommittedUrl('');
    setIframeSrc('');
    teardownTransport();
  }, [
    desktopCommittedUrlRef,
    setActiveUrl,
    setCurrentPageTitle,
    setDesktopCommittedUrl,
    setIframeSrc,
    setIsElementPickerEnabled,
    setPreviewLoadError,
    setRequestedIframeUrl,
    setUrl,
    teardownTransport,
  ]);

  const navigateIframeInPlace = useCallback(
    (targetUrl: string): boolean => {
      if (preferredTransportMode === 'desktop-native') {
        const controller = transportControllerRef.current;
        if (controller?.mode !== 'desktop-native' || !controller.navigate) return false;

        skipExternalHistorySyncRef.current = true;
        setPreviewLoadError(null);
        setCurrentPageTitle('');
        setUrl(targetUrl);
        setActiveUrl(targetUrl);
        void controller.navigate(targetUrl);
        return true;
      }

      try {
        const iframeWin = iframeRef.current?.contentWindow;
        if (!iframeWin) return false;

        iframeUrlWatcherCleanupRef.current?.();
        iframeUrlWatcherCleanupRef.current = null;
        skipExternalHistorySyncRef.current = true;
        setPreviewLoadError(null);
        setCurrentPageTitle('');
        setUrl(targetUrl);
        setActiveUrl(targetUrl);
        iframeWin.location.replace(targetUrl);
        return true;
      } catch {
        return false;
      }
    },
    [
      iframeRef,
      iframeUrlWatcherCleanupRef,
      preferredTransportMode,
      setActiveUrl,
      setCurrentPageTitle,
      setPreviewLoadError,
      setUrl,
      transportControllerRef,
    ],
  );

  const handleGoBack = useCallback(() => {
    if (!canGoBack) return;

    const newIndex = clampedHistoryIndex - 1;
    const previousUrl = history[newIndex];
    if (!previousUrl) return;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    if (!navigateIframeInPlace(previousUrl)) {
      navigateToUrl(previousUrl, false);
    }
  }, [canGoBack, clampedHistoryIndex, history, navigateIframeInPlace, navigateToUrl]);

  const handleGoForward = useCallback(() => {
    if (!canGoForward) return;

    const newIndex = clampedHistoryIndex + 1;
    const nextUrl = history[newIndex];
    if (!nextUrl) return;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    if (!navigateIframeInPlace(nextUrl)) {
      navigateToUrl(nextUrl, false);
    }
  }, [canGoForward, clampedHistoryIndex, history, navigateIframeInPlace, navigateToUrl]);

  return {
    canGoBack,
    canGoForward,
    focusUrlInput,
    handleGoBack,
    handleGoForward,
    handleGoHome,
    handleRefresh,
    handleUrlInputBlur,
    navigateToUrl,
    pushHistoryEntry,
    skipExternalHistorySyncRef,
    userEditedUrlRef,
  };
}
