"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createTranslator, useTranslations } from 'next-intl';
import { useQueryStates } from "nuqs";
import { toastManager } from "@workspace/ui";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import { previewToolbarParams, type PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import type { PreviewHelperCapability, PreviewHelperPayload } from "../lib/preview-helper/types";
import type {
  PreviewTransportMode,
  PreviewBridgeController,
  PreviewBridgeEventHandlers,
} from "../lib/preview-bridge/types";
import { connectSameOriginPreviewTransport } from "../lib/preview-transports/same-origin-transport";
import { connectExtensionPreviewTransport } from "../lib/preview-transports/extension-transport";
import { connectDesktopPreviewTransport, getPreviewViewportBounds } from "../lib/preview-transports/desktop-transport";
import { PreviewContent } from "./PreviewContent";
import { PreviewToolbar } from "./PreviewToolbar";
import { PreviewViewport } from "./PreviewViewport";
import { PreviewBrowserTabBar, type PreviewBrowserTabBarProps } from "./PreviewBrowserTabBar";
import { PreviewFavoritesListPopover } from "./PreviewFavoritesListPopover";
import { usePreviewExtensionDownloads } from "../hooks/use-preview-extension-downloads";
import { usePreviewFavorites } from "../hooks/use-preview-favorites";
import { usePreviewIframeLoad } from "../hooks/use-preview-iframe-load";
import { usePreviewLifecycleEffects } from "../hooks/use-preview-lifecycle-effects";
import { usePreviewNavigation } from "../hooks/use-preview-navigation";
import { useNativePreviewOcclusion } from "../hooks/use-native-preview-occlusion";
import { usePreviewSelection } from "../hooks/use-preview-selection";
import { usePreviewToolbarLayout } from "../hooks/use-preview-toolbar-layout";
import { usePreviewWindowState } from "../hooks/use-preview-window-state";
import {
  PREVIEW_EXTENSION_REQUIRED_MESSAGE,
  PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
  canonicalizeUrl,
  createPreviewNetworkError,
  isLocalPreviewTarget,
  normalizePreviewPageTitle,
  parseTransportLoadError,
  splitDisplayUrl,
  type PreviewLoadError,
} from "../lib/preview-utils";

type ViewMode = PreviewViewMode;

const DEVTOOLS_OCCLUSION_SUPPRESSION_MS = 4000;

interface PreviewProps {
  url: string;
  setUrl: (url: string) => void;
  activeUrl: string;
  setActiveUrl: (url: string) => void;
  isActive?: boolean;
  isMaximized?: boolean;
  workspaceId?: string | null;
  projectId?: string;
  setIsMaximized?: React.Dispatch<React.SetStateAction<boolean>>;
  onPageTitleChange?: (title: string, pageUrl?: string) => void;
  onPageIconChange?: (faviconUrl: string) => void;
  onOpenPageInNewTab?: (url: string) => void;
  browserTabBarProps?: Omit<PreviewBrowserTabBarProps, "chromeControls">;
  isStandaloneBrowserWindow?: boolean;
  isPreviewStandaloneOpen?: boolean;
  isMaximizedLayoutManaged?: boolean;
  allowMaximize?: boolean;
  disableNativePreviewOcclusion?: boolean;
  canvasViewportControllerRef?: React.MutableRefObject<PreviewCanvasViewportController | null>;
  onOpenPreviewBrowserWindow?: (url: string) => Promise<void> | void;
  onCloseStandalonePreviewWindow?: () => void;
}

export interface PreviewCanvasViewportController {
  syncViewport: () => void;
  hide: () => void;
}

interface PreviewTransportState {
  mode: PreviewTransportMode | 'unavailable';
  connected: boolean;
  message: string;
  capabilities: string[];
}

type PreviewTranslationValues = Record<string, string | number | boolean | null | undefined>;

let cachedPreviewLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPreviewTranslator: any = null;

function formatPreviewFallbackMessage(template: string, values?: PreviewTranslationValues): string {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}

function previewT(key: string, fallback: string, values?: PreviewTranslationValues): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedPreviewTranslator || cachedPreviewLocale !== locale) {
    cachedPreviewLocale = locale;
    cachedPreviewTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'browser.preview',
    });
  }

  try {
    return cachedPreviewTranslator(key as never, values as never);
  } catch {
    return formatPreviewFallbackMessage(fallback, values);
  }
}


export const Preview: React.FC<PreviewProps> = ({
  url,
  setUrl,
  activeUrl,
  setActiveUrl,
  isActive = true,
  isMaximized: controlledIsMaximized,
  workspaceId,
  projectId,
  setIsMaximized: controlledSetIsMaximized,
  onPageTitleChange,
  onPageIconChange,
  onOpenPageInNewTab,
  browserTabBarProps,
  isStandaloneBrowserWindow = false,
  isPreviewStandaloneOpen = false,
  isMaximizedLayoutManaged = false,
  allowMaximize = true,
  disableNativePreviewOcclusion = false,
  canvasViewportControllerRef,
  onOpenPreviewBrowserWindow,
  onCloseStandalonePreviewWindow,
}) => {
  const previewToolbarT = useTranslations("preview.toolbar");
  const headerHasOpenOverlay = useDialogStore(s => s.headerHasOpenOverlay);
  const isGlobalSearchOpen = useDialogStore(s => s.isGlobalSearchOpen);
  const { isRightCollapsed } = useSidebarLayout();
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeSrc, setIframeSrc] = useState(activeUrl);
  const [requestedIframeUrl, setRequestedIframeUrl] = useState(activeUrl);
  const [navigationToken, setNavigationToken] = useState(0);
  const [desktopCommittedUrl, setDesktopCommittedUrl] = useState(activeUrl);
  const desktopCommittedUrlRef = useRef(activeUrl);
  const [isElementPickerTooltipOpen, setIsElementPickerTooltipOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoadingState] = useState(false);
  const [previewLoadError, setPreviewLoadError] = useState<PreviewLoadError | null>(null);
  const [currentPageTitle, setCurrentPageTitle] = useState("");
  const [isUrlInputFocused, setIsUrlInputFocused] = useState(false);
  const [suppressNativePreviewOcclusion, setSuppressNativePreviewOcclusion] = useState(false);
  const [transportState, setTransportState] = useState<PreviewTransportState>({
    mode: 'unavailable',
    connected: false,
    message: '',
    capabilities: [],
  });
  const [{
    pvView: viewModeParam,
    pvToolbar: isToolbarHiddenParam,
    pvPick: isElementPickerEnabledParam,
  }, setPreviewToolbarParams] = useQueryStates(previewToolbarParams);
  const viewMode: ViewMode = viewModeParam === "mobile" ? "mobile" : "desktop";
  const isToolbarHidden = isToolbarHiddenParam;
  const [localIsElementPickerEnabled, setLocalIsElementPickerEnabled] = useState(isElementPickerEnabledParam);
  const isElementPickerEnabled = localIsElementPickerEnabled;
  const isElementPickerEnabledRef = useRef(isElementPickerEnabled);
  isElementPickerEnabledRef.current = isElementPickerEnabled;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const desktopViewportRef = useRef<HTMLDivElement | null>(null);
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const iframeUrlWatcherCleanupRef = useRef<(() => void) | null>(null);
  const transportControllerRef = useRef<PreviewBridgeController | null>(null);
  const transportSessionIdRef = useRef<string | null>(null);
  const desktopPreviewUrlRef = useRef<string | null>(null);
  const desktopPreviewViewportRef = useRef<string | null>(null);
  const desktopPreviewVisibleRef = useRef(false);
  const isPreviewLoadingRef = useRef(false);
  const forceDesktopNavigationRef = useRef(false);
  const devToolsOcclusionTimerRef = useRef<number | null>(null);
  const desktopConnectingRef = useRef(false);
  const canvasViewportSyncInFlightRef = useRef(false);
  const canvasViewportSyncQueuedRef = useRef(false);
  const canvasViewportSyncRafRef = useRef<number | null>(null);
  const canvasViewportSyncRequesterRef = useRef<(() => void) | null>(null);
  const iframeLoadResolveRef = useRef<(() => void) | null>(null);
  const extensionVersionRef = useRef<string | null>(null);
  const extensionConnectingRef = useRef(false);
  const setUrlRef = useRef(setUrl);
  const setActiveUrlRef = useRef(setActiveUrl);
  const onPageTitleChangeRef = useRef(onPageTitleChange);
  const onPageIconChangeRef = useRef(onPageIconChange);
  const onOpenPageInNewTabRef = useRef(onOpenPageInNewTab);
  const {
    isMaximized,
    needsDesktopPreviewSafeInset,
    setIsMaximized,
  } = usePreviewWindowState({
    isMaximized: controlledIsMaximized,
    reserveDesktopWindowControlsInset: isStandaloneBrowserWindow,
    setIsMaximized: controlledSetIsMaximized,
  });
  setUrlRef.current = setUrl;
  setActiveUrlRef.current = setActiveUrl;
  onPageTitleChangeRef.current = onPageTitleChange;
  onPageIconChangeRef.current = onPageIconChange;
  onOpenPageInNewTabRef.current = onOpenPageInNewTab;

  const setPreviewUrl = useCallback((nextUrl: string) => {
    setUrlRef.current(nextUrl);
  }, []);

  const setPreviewActiveUrl = useCallback((nextUrl: string) => {
    setActiveUrlRef.current(nextUrl);
  }, []);

  const setIsPreviewLoading = useCallback((nextIsPreviewLoading: boolean) => {
    isPreviewLoadingRef.current = nextIsPreviewLoading;
    setIsPreviewLoadingState(nextIsPreviewLoading);
  }, []);

  const setViewMode = useCallback((nextViewMode: ViewMode) => {
    void setPreviewToolbarParams({ pvView: nextViewMode });
  }, [setPreviewToolbarParams]);

  const setIsElementPickerEnabled = useCallback((nextIsElementPickerEnabled: boolean) => {
    isElementPickerEnabledRef.current = nextIsElementPickerEnabled;
    setLocalIsElementPickerEnabled(nextIsElementPickerEnabled);
    void setPreviewToolbarParams({ pvPick: nextIsElementPickerEnabled });
  }, [setPreviewToolbarParams]);

  useEffect(() => {
    setLocalIsElementPickerEnabled(isElementPickerEnabledParam);
    isElementPickerEnabledRef.current = isElementPickerEnabledParam;
  }, [isElementPickerEnabledParam]);

  useEffect(() => {
    return () => {
      if (devToolsOcclusionTimerRef.current != null) {
        window.clearTimeout(devToolsOcclusionTimerRef.current);
      }
    };
  }, []);

  const normalizedActiveUrl = useMemo(() => canonicalizeUrl(activeUrl), [activeUrl]);
  const normalizedActiveUrlRef = useRef(normalizedActiveUrl);
  normalizedActiveUrlRef.current = normalizedActiveUrl;
  const setNormalizedCurrentPageTitle = useCallback((pageTitle: string, pageUrl?: string) => {
    const normalizedPageUrl = pageUrl ?? normalizedActiveUrlRef.current;
    const normalizedTitle = normalizePreviewPageTitle(pageTitle, normalizedPageUrl);
    setCurrentPageTitle(normalizedTitle);
    onPageTitleChangeRef.current?.(normalizedTitle, normalizedPageUrl);
  }, []);
  const normalizedDraftUrl = useMemo(() => canonicalizeUrl(url ?? ""), [url]);
  const displayUrlParts = useMemo(() => splitDisplayUrl(url ?? ""), [url]);
  const displayPageTitle = useMemo(
    () => (normalizedDraftUrl && normalizedDraftUrl === normalizedActiveUrl ? currentPageTitle.trim() : ""),
    [currentPageTitle, normalizedActiveUrl, normalizedDraftUrl],
  );
  const {
    activeFavorite,
    favoriteNameDraft,
    favoritePopoverOpen,
    favoriteSearch,
    favorites,
    favoritesListOpen,
    filteredFavorites,
    handleAddFavorite,
    handleDeleteFavorite,
    handleRenameFavorite,
    renameDraft,
    renamingUrl,
    savingFavorite,
    setFavoriteNameDraft,
    setFavoritePopoverOpen,
    setFavoriteSearch,
    setFavoritesListOpen,
    setRenameDraft,
    setRenamingUrl,
  } = usePreviewFavorites({
    currentPageTitle,
    normalizedActiveUrl,
  });
  const preferredTransportMode = useMemo<PreviewTransportMode | 'unavailable'>(() => {
    if (!normalizedActiveUrl || typeof window === "undefined") return 'unavailable';

    try {
      if (isTauriRuntime()) {
        return 'desktop-native';
      }
      const nextUrl = new URL(normalizedActiveUrl);
      if (nextUrl.origin === window.location.origin) {
        return 'same-origin';
      }
      return isLocalPreviewTarget(normalizedActiveUrl) ? 'extension' : 'unavailable';
    } catch {
      return isTauriRuntime() ? 'desktop-native' : 'unavailable';
    }
  }, [normalizedActiveUrl]);
  const isDesktopNativePreviewOccluded = useNativePreviewOcclusion({
    enabled:
      preferredTransportMode === 'desktop-native' &&
      isActive &&
      !isStandaloneBrowserWindow &&
      !disableNativePreviewOcclusion &&
      !suppressNativePreviewOcclusion,
    surfaceRef: desktopViewportRef,
    ignoredRootRef: previewRootRef,
  });
  const shouldSuspendDesktopPreview =
      preferredTransportMode === 'desktop-native' && (
        (!isStandaloneBrowserWindow && isPreviewStandaloneOpen) ||
        isPreviewLoading ||
        (!disableNativePreviewOcclusion && !suppressNativePreviewOcclusion && isDesktopNativePreviewOccluded) ||
        favoritesListOpen || favoritePopoverOpen ||
        headerHasOpenOverlay || isGlobalSearchOpen ||
        isRightCollapsed
      );
  const {
    checkExtensionUpdate,
    extensionDownloadStarted,
    extensionPopoverOpen,
    extensionUpdateAvailable,
    extensionUpdatePopoverOpen,
    handleDownloadExtension,
    handleDownloadExtensionUpdate,
    isDownloadingExtension,
    isRecheckingExtension,
    setExtensionPopoverOpen,
    setExtensionUpdatePopoverOpen,
    setIsRecheckingExtension,
  } = usePreviewExtensionDownloads({
    extensionVersionRef,
    preferredTransportMode,
    transportConnected: transportState.connected,
    transportMode: transportState.mode,
  });
  const {
    dismissSelectionPopover,
    editingAnnotationId,
    handleAddSelectionAnnotation,
    handleCopySelectionAnnotations,
    handleDeleteSelectionAnnotation,
    handleDesktopToolbarCopy,
    handleEditSelectionAnnotation,
    handleSelectedPayload,
    handleUpdateSelectionAnnotation,
    selectionAnnotations,
    selectionAnnotationCount,
    selectionInfo,
    selectionPopoverExpanded,
    selectionPopoverPosition,
    selectionPopoverRef,
    selectionPopoverVisible,
    setSelectionPopoverExpanded,
  } = usePreviewSelection({
    desktopViewportRef,
    iframeRef,
    isElementPickerEnabledRef,
    transportControllerRef,
  });

  useLayoutEffect(() => {
    if (preferredTransportMode === 'desktop-native') {
      return;
    }

    if (!iframeSrc) {
      setIsPreviewLoading(false);
      return;
    }

    setIsPreviewLoading(true);
  }, [iframeSrc, iframeKey, preferredTransportMode, setIsPreviewLoading]);

  const teardownTransport = useCallback((clearSelection = true) => {
    const activeController = transportControllerRef.current;
    transportControllerRef.current = null;
    transportSessionIdRef.current = null;
    desktopPreviewUrlRef.current = null;
    desktopPreviewViewportRef.current = null;
    desktopPreviewVisibleRef.current = false;
    extensionConnectingRef.current = false;
    if (activeController) {
      void (async () => {
        try {
          if (activeController.mode === 'desktop-native') {
            // Hide first so the native child webview cannot cover sibling UI while close is in flight.
            await Promise.resolve(activeController.hide?.());
          }
        } finally {
          await Promise.resolve(activeController.destroy());
        }
      })().catch(() => undefined);
    }

    if (clearSelection) {
      dismissSelectionPopover(false);
    }
  }, [dismissSelectionPopover]);

  const {
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
  } = usePreviewNavigation({
    activeUrl,
    desktopCommittedUrlRef,
    forceDesktopNavigationRef,
    desktopPreviewUrlRef,
    iframeRef,
    iframeUrlWatcherCleanupRef,
    normalizedActiveUrlRef,
    preferredTransportMode,
    setActiveUrl: setPreviewActiveUrl,
    setCurrentPageTitle,
    setDesktopCommittedUrl,
    setIframeSrc,
    setIsElementPickerEnabled,
    setIsPreviewLoading,
    setIsUrlInputFocused,
    setNavigationToken,
    setPreviewLoadError,
    setRequestedIframeUrl,
    setUrl: setPreviewUrl,
    teardownTransport,
    transportControllerRef,
    url,
    urlInputRef,
  });

  const getIframeAccess = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      const frameWindow = iframe?.contentWindow;
      const frameDocument = iframe?.contentDocument;
      if (!iframe || !frameWindow || !frameDocument) return null;
      void frameDocument.body;
      return { iframe, frameWindow, frameDocument };
    } catch {
      return null;
    }
  }, []);

  const syncSameOriginPreviewAccess = useCallback(() => {
    const access = getIframeAccess();
    if (!access) {
      setCurrentPageTitle("");
      setTransportState({
        mode: preferredTransportMode,
        connected: false,
        message: PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
        capabilities: [],
      });
      return null;
    }

    const title = access.frameDocument.title?.trim() ?? "";
    setNormalizedCurrentPageTitle(title, access.frameWindow.location.href);
    setTransportState((previous) => ({
      ...previous,
      mode: 'same-origin',
      connected: previous.mode === 'same-origin' ? previous.connected : false,
      message: "",
    }));

    return access;
  }, [getIframeAccess, preferredTransportMode, setNormalizedCurrentPageTitle]);

  const createPreviewSessionId = useCallback(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `preview-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }, []);

  const createTransportHandlers = useCallback((
    mode: PreviewTransportMode,
    extraHandlers?: PreviewBridgeEventHandlers,
  ) => ({
    onReady: (
      capabilities: PreviewHelperCapability[],
      extensionVersion?: string,
      pageTitle?: string,
      faviconUrl?: string,
      pageUrl?: string,
    ) => {
      if (extensionVersion) {
        extensionVersionRef.current = extensionVersion;
      }
      if (mode === 'extension') {
        extensionConnectingRef.current = false;
      }
      if (pageTitle !== undefined) {
        setNormalizedCurrentPageTitle(pageTitle, pageUrl);
      }
      if (faviconUrl !== undefined) {
        onPageIconChangeRef.current?.(faviconUrl);
      }
      setPreviewLoadError(null);
      setIsPreviewLoading(false);
      setTransportState({
        mode,
        connected: true,
        message: "",
        capabilities,
      });
      extraHandlers?.onReady?.(capabilities, extensionVersion, pageTitle, faviconUrl, pageUrl);
    },
    onSelected: (payload: PreviewHelperPayload) => {
      handleSelectedPayload(mode, payload);
      extraHandlers?.onSelected?.(payload);
    },
    onToolbarAction: (
      action: 'copy' | 'add' | 'update' | 'delete',
      note?: string,
      annotationId?: string,
    ) => {
      if (mode === 'desktop-native' && action === 'copy') {
        void handleDesktopToolbarCopy(note);
      } else if (mode === 'desktop-native' && action === 'add') {
        handleAddSelectionAnnotation(note, undefined, annotationId);
      } else if (mode === 'desktop-native' && action === 'update') {
        handleUpdateSelectionAnnotation(annotationId, note);
      } else if (mode === 'desktop-native' && action === 'delete') {
        handleDeleteSelectionAnnotation(annotationId);
      }
      extraHandlers?.onToolbarAction?.(action, note, annotationId);
    },
    onCleared: () => {
      dismissSelectionPopover(false);
      extraHandlers?.onCleared?.();
    },
    onError: (message: string) => {
      if (mode === 'extension') {
        extensionConnectingRef.current = false;
      }
      if (mode === 'desktop-native') {
        const loadError = parseTransportLoadError(
          message,
          desktopPreviewUrlRef.current ?? normalizedActiveUrlRef.current,
        );
        if (loadError) {
          desktopCommittedUrlRef.current = "";
          setDesktopCommittedUrl("");
          setPreviewLoadError(loadError);
          setIsPreviewLoading(false);
          desktopPreviewVisibleRef.current = false;
          void Promise.resolve(transportControllerRef.current?.hide?.());
        }
      }
      setTransportState((previous) => ({
        ...previous,
        mode,
        connected: false,
        message,
      }));
      extraHandlers?.onError?.(message);
    },
    onNavigationChanged: (nextUrl: string, pageTitle?: string, faviconUrl?: string) => {
      if (mode === 'desktop-native') {
        const canonicalUrl = canonicalizeUrl(nextUrl);
        desktopPreviewUrlRef.current = canonicalUrl;
        desktopCommittedUrlRef.current = canonicalUrl;
        setIsPreviewLoading(false);
        const viewport = desktopViewportRef.current;
        if (viewport) viewport.style.cursor = '';
        if (document.activeElement === urlInputRef.current) {
          urlInputRef.current?.blur();
        }
      }
      setPreviewUrl(nextUrl);
      setPreviewActiveUrl(nextUrl);
      if (pageTitle !== undefined) {
        setNormalizedCurrentPageTitle(pageTitle, nextUrl);
      }
      if (faviconUrl !== undefined) {
        onPageIconChangeRef.current?.(faviconUrl);
      }
      setPreviewLoadError(null);
      setIsPreviewLoading(false);
      if (skipExternalHistorySyncRef.current) {
        skipExternalHistorySyncRef.current = false;
      } else {
        pushHistoryEntry(nextUrl);
      }
      extraHandlers?.onNavigationChanged?.(nextUrl, pageTitle, faviconUrl);
    },
    onTitleChanged: (pageTitle: string, faviconUrl?: string, pageUrl?: string) => {
      setNormalizedCurrentPageTitle(pageTitle, pageUrl);
      if (faviconUrl !== undefined) {
        onPageIconChangeRef.current?.(faviconUrl);
      }
      extraHandlers?.onTitleChanged?.(pageTitle, faviconUrl, pageUrl);
    },
    onOpenTab: (targetUrl: string, sourceUrl?: string) => {
      const normalizedTargetUrl = canonicalizeUrl(targetUrl) || targetUrl.trim();
      if (!normalizedTargetUrl) return;
      onOpenPageInNewTabRef.current?.(normalizedTargetUrl);
      extraHandlers?.onOpenTab?.(normalizedTargetUrl, sourceUrl);
    },
    onCursorChange: (cursor: string) => {
      const viewport = desktopViewportRef.current;
      if (viewport) {
        viewport.style.cursor = cursor;
      }
      if (document.activeElement === urlInputRef.current) {
        urlInputRef.current?.blur();
      }
      extraHandlers?.onCursorChange?.(cursor);
    },
  }), [
    dismissSelectionPopover,
    handleAddSelectionAnnotation,
    handleDeleteSelectionAnnotation,
    handleDesktopToolbarCopy,
    handleSelectedPayload,
    handleUpdateSelectionAnnotation,
    pushHistoryEntry,
    setPreviewActiveUrl,
    setNormalizedCurrentPageTitle,
    setIsPreviewLoading,
    setPreviewUrl,
    skipExternalHistorySyncRef,
  ]);

  const connectIframeTransport = useCallback(async (options?: {
    enterPickMode?: boolean;
    awaitHandshake?: boolean;
  }) => {
    if (!normalizedActiveUrlRef.current) return false;

    const sessionId = createPreviewSessionId();
    const shouldEnterPickMode = options?.enterPickMode ?? true;
    const shouldAwaitHandshake = options?.awaitHandshake ?? false;

    if (preferredTransportMode === 'same-origin') {
      const handlers = createTransportHandlers('same-origin');
      const access = syncSameOriginPreviewAccess();
      if (!access) {
        setTransportState({
          mode: 'unavailable',
          connected: false,
          message: PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
          capabilities: [],
        });
        return false;
      }

      teardownTransport(false);
      transportSessionIdRef.current = sessionId;
      setTransportState({
        mode: 'same-origin',
        connected: false,
        message: '',
        capabilities: [],
      });
      transportControllerRef.current = connectSameOriginPreviewTransport(access.frameWindow, sessionId, handlers);
      if (shouldEnterPickMode) {
        void Promise.resolve(transportControllerRef.current.enterPickMode());
      }
      return true;
    }

    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) {
      return false;
    }

    let handshakeSettled = false;
    let resolveHandshake: ((connected: boolean) => void) | null = null;
    const settleHandshake = (connected: boolean) => {
      if (!shouldAwaitHandshake || handshakeSettled) return;
      handshakeSettled = true;
      resolveHandshake?.(connected);
    };
    const handlers = createTransportHandlers(
      'extension',
      shouldAwaitHandshake
        ? {
            onReady: () => settleHandshake(true),
            onError: () => settleHandshake(false),
          }
        : undefined,
    );

    teardownTransport(false);
    transportSessionIdRef.current = sessionId;
    extensionConnectingRef.current = true;
    transportControllerRef.current = connectExtensionPreviewTransport({
      frameWindow,
      pageUrl: normalizedActiveUrlRef.current,
      sessionId,
      parentOrigin: window.location.origin,
      allowedOrigins: [window.location.origin, 'http://localhost:3030', 'http://127.0.0.1:3030'],
      autoEnterPickMode: shouldEnterPickMode,
      ...handlers,
    });
    setTransportState((previous) => ({
      mode: 'extension',
      connected: previous.mode === 'extension' ? previous.connected : false,
      message:
        previous.mode === 'extension' && previous.connected
          ? ''
          : PREVIEW_EXTENSION_REQUIRED_MESSAGE,
      capabilities: previous.mode === 'extension' ? previous.capabilities : [],
    }));
    if (shouldAwaitHandshake) {
      const result = await Promise.race([
        new Promise<boolean>((resolve) => {
          resolveHandshake = resolve;
        }),
        new Promise<boolean>((resolve) => {
          window.setTimeout(() => resolve(false), 2_000);
        }),
      ]);
      settleHandshake(result);
      return result;
    }
    return true;
  }, [createPreviewSessionId, createTransportHandlers, preferredTransportMode, syncSameOriginPreviewAccess, teardownTransport]);

  const syncDesktopPreview = useCallback(async () => {
    const committedUrl = desktopCommittedUrlRef.current;
    if (preferredTransportMode !== 'desktop-native' || !committedUrl || !desktopViewportRef.current) {
      if (transportControllerRef.current?.mode === 'desktop-native') {
        teardownTransport(false);
      }
      return;
    }

    const viewport = await getPreviewViewportBounds(desktopViewportRef.current);
    const viewportKey = JSON.stringify(viewport);
    if (transportControllerRef.current?.mode === 'desktop-native' && transportSessionIdRef.current) {
      const activeController = transportControllerRef.current;
      const shouldNavigate = forceDesktopNavigationRef.current || desktopPreviewUrlRef.current !== committedUrl;
      if (shouldNavigate) {
        forceDesktopNavigationRef.current = false;
        await activeController.navigate?.(committedUrl);
        desktopPreviewUrlRef.current = committedUrl;
      }
      setPreviewLoadError(null);
      if (desktopPreviewViewportRef.current !== viewportKey) {
        await activeController.updateViewport?.(viewport);
        desktopPreviewViewportRef.current = viewportKey;
      }
      if (isPreviewLoadingRef.current && shouldNavigate) {
        await activeController.hide?.();
        desktopPreviewVisibleRef.current = false;
      } else if (isPreviewLoadingRef.current) {
        setIsPreviewLoading(false);
      }
      setTransportState((previous) =>
        previous.mode === 'desktop-native'
          ? previous
          : {
              ...previous,
              mode: 'desktop-native',
            },
      );
      return;
    }

    if (desktopConnectingRef.current) return;
    desktopConnectingRef.current = true;

    teardownTransport(false);
    const sessionId = createPreviewSessionId();
    transportSessionIdRef.current = sessionId;
    try {
      transportControllerRef.current = await connectDesktopPreviewTransport({
        sessionId,
        pageUrl: committedUrl,
        viewport,
        ...createTransportHandlers('desktop-native'),
      });
      forceDesktopNavigationRef.current = false;
      desktopPreviewUrlRef.current = committedUrl;
      desktopPreviewViewportRef.current = viewportKey;
      desktopPreviewVisibleRef.current = true;
      setPreviewLoadError(null);
      if (isPreviewLoadingRef.current) {
        await transportControllerRef.current.hide?.();
        desktopPreviewVisibleRef.current = false;
      }
      setTransportState({
        mode: 'desktop-native',
        connected: true,
        message: '',
        capabilities: [],
      });
    } catch (error) {
      console.error('[preview] desktop transport connect failed:', error);
      desktopCommittedUrlRef.current = "";
      setDesktopCommittedUrl("");
      setPreviewLoadError(createPreviewNetworkError(committedUrl, error));
      setIsPreviewLoading(false);
      setTransportState({
        mode: 'desktop-native',
        connected: false,
        message: previewT(
          'desktopTransport.openFailedMessage',
          'Failed to open Browser window: {errorMessage}',
          { errorMessage: error instanceof Error ? error.message : String(error) },
        ),
        capabilities: [],
      });
    } finally {
      desktopConnectingRef.current = false;
    }
  }, [createPreviewSessionId, createTransportHandlers, preferredTransportMode, setIsPreviewLoading, teardownTransport]);

  const showDesktopPreview = useCallback(async () => {
    if (preferredTransportMode !== 'desktop-native' || !desktopCommittedUrlRef.current || !desktopViewportRef.current) return;
    if (transportControllerRef.current?.mode !== 'desktop-native') {
      await syncDesktopPreview();
      return;
    }
    if (!desktopPreviewVisibleRef.current) {
      await transportControllerRef.current.show?.();
      desktopPreviewVisibleRef.current = true;
    }
    const viewport = await getPreviewViewportBounds(desktopViewportRef.current);
    const viewportKey = JSON.stringify(viewport);
    if (desktopPreviewViewportRef.current !== viewportKey) {
      await transportControllerRef.current.updateViewport?.(viewport);
      desktopPreviewViewportRef.current = viewportKey;
    }
  }, [preferredTransportMode, syncDesktopPreview]);

  const hideDesktopPreview = useCallback(async () => {
    if (transportControllerRef.current?.mode !== 'desktop-native') return;
    if (!desktopPreviewVisibleRef.current) return;
    await transportControllerRef.current.hide?.();
    desktopPreviewVisibleRef.current = false;
  }, []);

  const runCanvasViewportSync = useCallback(async () => {
    if (
      preferredTransportMode !== 'desktop-native' ||
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
    if (
      rect.width < 16 ||
      rect.height < 16 ||
      visibleWidth < 8 ||
      visibleHeight < 8
    ) {
      await hideDesktopPreview();
      return;
    }

    await showDesktopPreview();
  }, [hideDesktopPreview, preferredTransportMode, shouldSuspendDesktopPreview, showDesktopPreview]);

  const syncCanvasViewport = useCallback(() => {
    if (canvasViewportSyncInFlightRef.current) {
      canvasViewportSyncQueuedRef.current = true;
      return;
    }

    canvasViewportSyncInFlightRef.current = true;
    void (async () => {
      try {
        await runCanvasViewportSync();
      } finally {
        canvasViewportSyncInFlightRef.current = false;
        if (!canvasViewportSyncQueuedRef.current) return;

        canvasViewportSyncQueuedRef.current = false;
        if (canvasViewportSyncRafRef.current != null) {
          window.cancelAnimationFrame(canvasViewportSyncRafRef.current);
        }
        canvasViewportSyncRafRef.current = window.requestAnimationFrame(() => {
          canvasViewportSyncRafRef.current = null;
          canvasViewportSyncRequesterRef.current?.();
        });
      }
    })().catch(() => undefined);
  }, [runCanvasViewportSync]);
  canvasViewportSyncRequesterRef.current = syncCanvasViewport;

  useEffect(() => {
    return () => {
      if (canvasViewportSyncRafRef.current != null) {
        window.cancelAnimationFrame(canvasViewportSyncRafRef.current);
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

  const handleOpenDeveloperTools = useCallback(async () => {
    if (preferredTransportMode !== 'desktop-native') return;

    if (devToolsOcclusionTimerRef.current != null) {
      window.clearTimeout(devToolsOcclusionTimerRef.current);
      devToolsOcclusionTimerRef.current = null;
    }
    setSuppressNativePreviewOcclusion(true);

    try {
      if (transportControllerRef.current?.mode !== 'desktop-native') {
        await syncDesktopPreview();
      }
      const controller = transportControllerRef.current;
      if (controller?.mode !== 'desktop-native' || !controller.openDevTools) {
        throw new Error('Desktop Browser is not ready for developer tools.');
      }
      await controller.openDevTools();
    } catch (error) {
      setSuppressNativePreviewOcclusion(false);
      console.error('[preview] failed to open developer tools:', error);
      toastManager.add({
        title: previewT('developerTools.openFailedTitle', 'Failed to open developer tools'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      });
      return;
    }

    devToolsOcclusionTimerRef.current = window.setTimeout(() => {
      devToolsOcclusionTimerRef.current = null;
      setSuppressNativePreviewOcclusion(false);
    }, DEVTOOLS_OCCLUSION_SUPPRESSION_MS);
  }, [preferredTransportMode, syncDesktopPreview]);

  const handleIframeLoad = usePreviewIframeLoad({
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
    setActiveUrl: setPreviewActiveUrl,
    setCurrentPageTitle: setNormalizedCurrentPageTitle,
    setIsPreviewLoading,
    setPreviewLoadError,
    setUrl: setPreviewUrl,
    skipExternalHistorySyncRef,
    syncSameOriginPreviewAccess,
    transportControllerRef,
  });

  usePreviewLifecycleEffects({
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
    setIframeKey,
    setIframeSrc,
    setIsElementPickerEnabled,
    setIsPreviewLoading,
    setPreviewLoadError,
    setTransportState,
    shouldSuspendDesktopPreview,
    showDesktopPreview,
    syncDesktopPreview,
    teardownTransport,
    transportConnected: transportState.connected,
    transportControllerRef,
    viewMode,
  });

  const handleToggleElementPicker = useCallback(async () => {
    if (!normalizedActiveUrlRef.current) return;

    if (isElementPickerEnabledRef.current) {
      isElementPickerEnabledRef.current = false;
      setIsElementPickerEnabled(false);
      const viewport = desktopViewportRef.current;
      if (viewport) viewport.style.cursor = '';
      await Promise.resolve(transportControllerRef.current?.exitPickMode());
      dismissSelectionPopover(false);
      return;
    }

    if (preferredTransportMode === 'desktop-native') {
      if (!transportControllerRef.current) {
        await syncDesktopPreview();
      }
      await Promise.resolve(transportControllerRef.current?.enterPickMode());
      isElementPickerEnabledRef.current = true;
      setIsElementPickerEnabled(true);
      return;
    }

    if (transportControllerRef.current && transportState.connected) {
      await Promise.resolve(transportControllerRef.current.enterPickMode());
      isElementPickerEnabledRef.current = true;
      setIsElementPickerEnabled(true);
      return;
    }

    const installed = await connectIframeTransport();
    if (!installed) {
      toastManager.add({
        type: "error",
        title: previewT('elementPicker.title.unavailable', 'Element picker unavailable'),
        description:
          preferredTransportMode === 'extension'
            ? PREVIEW_EXTENSION_REQUIRED_MESSAGE
            : PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
      });
      return;
    }

    isElementPickerEnabledRef.current = true;
    setIsElementPickerEnabled(true);
    void checkExtensionUpdate();
  }, [
    checkExtensionUpdate,
    connectIframeTransport,
    dismissSelectionPopover,
    preferredTransportMode,
    setIsElementPickerEnabled,
    syncDesktopPreview,
    transportState.connected,
  ]);

  const resolvedTransportMode =
    transportState.mode === 'unavailable' && normalizedActiveUrl
      ? preferredTransportMode
      : transportState.mode;
  const {
    desktopToolbarExpanded,
    effectiveIsToolbarHidden,
    setDesktopToolbarHovered,
    setIsToolbarHidden,
    shouldHideToolbarExternalActions,
    shouldHideToolbarNavigation,
    shouldHideToolbarStatus,
    shouldHideToolbarViewControls,
    shouldStackPreviewHomeCards,
    shouldUseCompactToolbar,
    toolbarHoverSuppressed,
    toolbarRowRef,
    toolbarToggleTitle,
    usesDesktopToolbarExpand,
    usesToolbarHoverOverlay,
  } = usePreviewToolbarLayout({
    isToolbarHidden,
    resolvedTransportMode,
    setToolbarHiddenParam: (nextIsToolbarHidden) => {
      void setPreviewToolbarParams({ pvToolbar: nextIsToolbarHidden });
    },
  });

  const handleToggleToolbarHidden = useCallback(() => {
    setIsToolbarHidden(!effectiveIsToolbarHidden);
  }, [effectiveIsToolbarHidden, setIsToolbarHidden]);

  const handleToggleMaximized = useCallback(() => {
    setIsMaximized((current) => !current);
  }, [setIsMaximized]);

  const canOpenPreviewBrowserWindow = useMemo(
    () => isTauriRuntime() && !isStandaloneBrowserWindow && Boolean(onOpenPreviewBrowserWindow),
    [isStandaloneBrowserWindow, onOpenPreviewBrowserWindow],
  );

  const handleOpenPreviewBrowserWindow = useCallback(async () => {
    if (!onOpenPreviewBrowserWindow) return;
    teardownTransport(false);
    await onOpenPreviewBrowserWindow(normalizedActiveUrl || activeUrl);
  }, [activeUrl, normalizedActiveUrl, onOpenPreviewBrowserWindow, teardownTransport]);

  const handleCloseStandalonePreviewWindow = useCallback(() => {
    teardownTransport(false);
    onCloseStandalonePreviewWindow?.();
  }, [onCloseStandalonePreviewWindow, teardownTransport]);

  const shouldShowExtensionInstall = resolvedTransportMode === 'extension' && !transportState.connected;

  const handleRecheckExtension = useCallback(async () => {
    if (preferredTransportMode !== 'extension' || isRecheckingExtension) return;

    setIsRecheckingExtension(true);
    try {
      // Reload the iframe so the extension's content script gets injected
      // into the page (content scripts only run on page load).
      setIframeKey((prev) => prev + 1);
      await new Promise<void>((resolve) => {
        iframeLoadResolveRef.current = resolve;
      });

      const connected = await connectIframeTransport({
        enterPickMode: false,
        awaitHandshake: true,
      });

      if (!connected) {
        toastManager.add({
          type: 'info',
          title: previewT('extension.notDetectedTitle', 'Extension not detected'),
          description: PREVIEW_EXTENSION_REQUIRED_MESSAGE,
        });
      }
    } finally {
      setIsRecheckingExtension(false);
    }
  }, [connectIframeTransport, isRecheckingExtension, preferredTransportMode, setIsRecheckingExtension]);

  const elementPickerAction = isElementPickerEnabled
    ? previewT('elementPicker.action.disable', 'Disable')
    : previewT('elementPicker.action.enable', 'Enable');
  const elementPickerTitle = !activeUrl
    ? previewT('elementPicker.title.enterUrlFirst', 'Enter a URL first')
    : preferredTransportMode === 'unavailable'
      ? previewT('elementPicker.title.unavailable', 'Element picker unavailable')
    : isElementPickerEnabled
      ? previewT('elementPicker.title.disable', 'Disable element picker')
      : previewT('elementPicker.title.enable', 'Enable element picker');
  const elementPickerTooltip = !activeUrl
    ? previewT('elementPicker.tooltip.enterUrlFirst', 'Enter a URL first.')
    : preferredTransportMode === 'unavailable'
      ? previewT(
          'elementPicker.tooltip.unavailable',
          'Element selection is only available for same-origin pages, local development URLs, or the desktop Browser.',
        )
    : preferredTransportMode === 'desktop-native'
      ? previewT(
          'elementPicker.tooltip.desktopNative',
          '{action} element selection. Source component detection runs through the desktop native Browser and supports React, Vue, Angular, and Svelte.',
          { action: elementPickerAction },
        )
      : preferredTransportMode === 'extension'
        ? previewT(
            'elementPicker.tooltip.extension',
            '{action} element selection. Cross-port pages use the Atmos Inspector extension. Source component detection supports React, Vue, Angular, and Svelte.',
            { action: elementPickerAction },
          )
        : previewT(
            'elementPicker.tooltip.default',
            '{action} element selection. Source component detection supports React, Vue, Angular, and Svelte.',
            { action: elementPickerAction },
          );
  const isChromeManagedByTabBar = Boolean(browserTabBarProps);
  const toolbarProps: React.ComponentProps<typeof PreviewToolbar> = {
    activeFavorite,
    activeUrl,
    canGoBack,
    canGoForward,
    desktopToolbarExpanded: isChromeManagedByTabBar ? false : desktopToolbarExpanded,
    displayPageTitle,
    displayUrlParts,
    elementPickerTitle,
    elementPickerTooltip,
    extensionDownloadStarted,
    extensionPopoverOpen,
    extensionUpdateAvailable,
    extensionUpdatePopoverOpen,
    favoriteNameDraft,
    favoritePopoverOpen,
    isDownloadingExtension,
    isElementPickerEnabled,
    isElementPickerTooltipOpen,
    isPreviewLoading,
    isRecheckingExtension,
    isUrlInputFocused,
    needsDesktopPreviewSafeInset: needsDesktopPreviewSafeInset && !browserTabBarProps,
    normalizedActiveUrl,
    preferredTransportMode,
    savingFavorite,
    selectionAnnotationCount,
    shouldHideToolbarExternalActions,
    shouldHideToolbarNavigation,
    shouldHideToolbarStatus,
    shouldHideToolbarViewControls,
    shouldShowExtensionInstall,
    shouldUseCompactToolbar,
    toolbarHoverSuppressed: isChromeManagedByTabBar ? false : toolbarHoverSuppressed,
    toolbarRowRef,
    url,
    urlInputRef,
    userEditedUrlRef,
    usesDesktopToolbarExpand: isChromeManagedByTabBar ? false : usesDesktopToolbarExpand,
    usesToolbarHoverOverlay: isChromeManagedByTabBar ? false : usesToolbarHoverOverlay,
    viewMode,
    focusUrlInput,
    handleAddFavorite,
    handleDownloadExtension,
    handleDownloadExtensionUpdate,
    handleGoBack,
    handleGoForward,
    handleGoHome,
    handleCopySelectionAnnotations,
    handleOpenDeveloperTools,
    handleRefresh,
    handleRecheckExtension,
    handleToggleElementPicker,
    handleUrlInputBlur,
    setDesktopToolbarHovered,
    setExtensionPopoverOpen,
    setExtensionUpdatePopoverOpen,
    setFavoriteNameDraft,
    setFavoritePopoverOpen,
    setIsElementPickerTooltipOpen,
    setUrl: setPreviewUrl,
    setViewMode,
  };

  const handleOpenLocalServiceUrl = useCallback((nextUrl: string) => {
    navigateToUrl(nextUrl);
  }, [navigateToUrl]);

  const viewportProps: React.ComponentProps<typeof PreviewViewport> = {
    activeUrl,
    desktopViewportRef,
    dismissSelectionPopover,
    favoritesListOpen,
    handleIframeLoad,
    handleRefresh,
    iframeKey,
    iframeRef,
    iframeSrc,
    isDesktopNativePreviewOccluded,
    isPreviewLoading,
    onCloseFavoritesList: () => setFavoritesListOpen(false),
    onDismissElementPickerTooltip: () => setIsElementPickerTooltipOpen(false),
    preferredTransportMode,
    projectId,
    previewLoadError,
    requestedIframeUrl,
    resolvedTransportMode,
    selectionInfo,
    selectionAnnotations,
    editingAnnotationId,
    onAddSelectionAnnotation: (selectionInfo, note) => handleAddSelectionAnnotation(note, selectionInfo),
    onDeleteSelectionAnnotation: handleDeleteSelectionAnnotation,
    onEditSelectionAnnotation: handleEditSelectionAnnotation,
    onUpdateSelectionAnnotation: (_selectionInfo, note) => handleUpdateSelectionAnnotation(editingAnnotationId ?? undefined, note),
    selectionPopoverExpanded,
    selectionPopoverPosition,
    selectionPopoverRef,
    selectionPopoverVisible,
    setSelectionPopoverExpanded,
    shouldStackPreviewHomeCards,
    workspaceId,
    onOpenLocalServiceUrl: handleOpenLocalServiceUrl,
    transportMessage: transportState.message,
    viewMode,
  };

  return (
    <PreviewContent
      browserTabBar={
        browserTabBarProps ? (
          <PreviewBrowserTabBar
            {...browserTabBarProps}
            chromeControls={{
              favoritesList: (
                <PreviewFavoritesListPopover
                  favoriteSearch={favoriteSearch}
                  favorites={favorites}
                  favoritesListOpen={favoritesListOpen}
                  filteredFavorites={filteredFavorites}
                  renameDraft={renameDraft}
                  renamingUrl={renamingUrl}
                  handleDeleteFavorite={handleDeleteFavorite}
                  handleRenameFavorite={handleRenameFavorite}
                  navigateToUrl={navigateToUrl}
                  setFavoriteSearch={setFavoriteSearch}
                  setFavoritesListOpen={setFavoritesListOpen}
                  setRenameDraft={setRenameDraft}
                  setRenamingUrl={setRenamingUrl}
                />
              ),
              isMaximized,
              isToolbarHidden: effectiveIsToolbarHidden,
              needsDesktopPreviewSafeInset,
              openInWindowTitle: previewToolbarT("actions.openPreviewBrowserWindow"),
              returnToEmbeddedTitle: previewToolbarT("actions.returnToEmbeddedPreview"),
              toolbarToggleTitle,
              onOpenInWindow: canOpenPreviewBrowserWindow ? handleOpenPreviewBrowserWindow : undefined,
              onReturnToEmbedded: isStandaloneBrowserWindow ? handleCloseStandalonePreviewWindow : undefined,
              onToggleMaximized:
                allowMaximize && !isStandaloneBrowserWindow
                  ? handleToggleMaximized
                  : undefined,
              onToggleToolbarHidden: handleToggleToolbarHidden,
            }}
          />
        ) : null
      }
      isChromeHidden={isChromeManagedByTabBar && effectiveIsToolbarHidden}
      isMaximized={isMaximized}
      isMaximizedLayoutManaged={isMaximizedLayoutManaged}
      previewRootRef={previewRootRef}
      toolbarProps={toolbarProps}
      toolbarHoverSuppressed={toolbarHoverSuppressed}
      viewportProps={viewportProps}
    />
  );
};
