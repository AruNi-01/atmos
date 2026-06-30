"use client";

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createTranslator, useTranslations } from 'next-intl';
import { useQueryStates } from "nuqs";
import { toastManager } from "@workspace/ui";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import { previewToolbarParams, type PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
import {
  closeCurrentStandaloneWindow,
  closeStandaloneSurface,
  isStandaloneSurfaceOpen as readStandaloneSurfaceOpen,
  makeStandaloneSurfaceKey,
  markStandaloneSurfaceOpen,
  restoreStandaloneSurface,
  subscribeStandaloneSurface,
} from "@/shared/lib/standalone-window-handoff";
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
import { openPreviewBrowserWindow } from "../lib/desktop-preview-browser-window";
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
  onPageTitleChange?: (title: string) => void;
  onPageIconChange?: (faviconUrl: string) => void;
  browserTabBarProps?: Omit<PreviewBrowserTabBarProps, "chromeControls">;
  isStandaloneBrowserWindow?: boolean;
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
      namespace: 'runPreview.preview',
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
  browserTabBarProps,
  isStandaloneBrowserWindow = false,
}) => {
  const previewToolbarT = useTranslations("preview.toolbar");
  const standaloneSurfaceKey = useMemo(
    () => makeStandaloneSurfaceKey("preview", workspaceId, projectId),
    [projectId, workspaceId],
  );
  const [isPreviewStandaloneOpen, setIsPreviewStandaloneOpen] = useState(false);
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
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewLoadError, setPreviewLoadError] = useState<PreviewLoadError | null>(null);
  const [currentPageTitle, setCurrentPageTitle] = useState("");
  const [isUrlInputFocused, setIsUrlInputFocused] = useState(false);
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
  const isElementPickerEnabled = isElementPickerEnabledParam;
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
  const desktopConnectingRef = useRef(false);
  const iframeLoadResolveRef = useRef<(() => void) | null>(null);
  const extensionVersionRef = useRef<string | null>(null);
  const extensionConnectingRef = useRef(false);
  const setUrlRef = useRef(setUrl);
  const setActiveUrlRef = useRef(setActiveUrl);
  const onPageTitleChangeRef = useRef(onPageTitleChange);
  const onPageIconChangeRef = useRef(onPageIconChange);
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

  const setPreviewUrl = useCallback((nextUrl: string) => {
    setUrlRef.current(nextUrl);
  }, []);

  const setPreviewActiveUrl = useCallback((nextUrl: string) => {
    setActiveUrlRef.current(nextUrl);
  }, []);

  React.useEffect(() => {
    onPageTitleChangeRef.current?.(currentPageTitle);
  }, [currentPageTitle]);

  const setViewMode = useCallback((nextViewMode: ViewMode) => {
    void setPreviewToolbarParams({ pvView: nextViewMode });
  }, [setPreviewToolbarParams]);

  const setIsElementPickerEnabled = useCallback((nextIsElementPickerEnabled: boolean) => {
    void setPreviewToolbarParams({ pvPick: nextIsElementPickerEnabled });
  }, [setPreviewToolbarParams]);

  const normalizedActiveUrl = useMemo(() => canonicalizeUrl(activeUrl), [activeUrl]);
  const normalizedActiveUrlRef = useRef(normalizedActiveUrl);
  normalizedActiveUrlRef.current = normalizedActiveUrl;
  const setNormalizedCurrentPageTitle = useCallback((pageTitle: string, pageUrl?: string) => {
    setCurrentPageTitle(normalizePreviewPageTitle(pageTitle, pageUrl ?? normalizedActiveUrlRef.current));
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
  const shouldSuspendDesktopPreview =
      preferredTransportMode === 'desktop-native' && (
        (!isStandaloneBrowserWindow && isPreviewStandaloneOpen) ||
        favoritesListOpen || favoritePopoverOpen ||
        headerHasOpenOverlay || isGlobalSearchOpen ||
        isRightCollapsed
      );
  React.useEffect(() => {
    if (isStandaloneBrowserWindow) {
      markStandaloneSurfaceOpen(standaloneSurfaceKey);
      const unsubscribe = subscribeStandaloneSurface(standaloneSurfaceKey, (_isOpen, event) => {
        if (event?.action === "restore" || event?.action === "close") {
          void closeCurrentStandaloneWindow();
        }
      });
      const handleBeforeUnload = () => closeStandaloneSurface(standaloneSurfaceKey);
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        unsubscribe();
        closeStandaloneSurface(standaloneSurfaceKey);
      };
    }

    setIsPreviewStandaloneOpen(readStandaloneSurfaceOpen(standaloneSurfaceKey));
    return subscribeStandaloneSurface(standaloneSurfaceKey, (isOpen) => {
      setIsPreviewStandaloneOpen(isOpen);
    });
  }, [isStandaloneBrowserWindow, standaloneSurfaceKey]);
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
  }, [iframeSrc, iframeKey, preferredTransportMode]);

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
      setTransportState({
        mode,
        connected: true,
        message: "",
        capabilities,
      });
      if (mode === 'desktop-native') {
        setIsPreviewLoading(false);
      }
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
      if (desktopPreviewUrlRef.current !== committedUrl) {
        await transportControllerRef.current.navigate?.(committedUrl);
        desktopPreviewUrlRef.current = committedUrl;
      }
      if (desktopPreviewViewportRef.current !== viewportKey) {
        await transportControllerRef.current.updateViewport?.(viewport);
        desktopPreviewViewportRef.current = viewportKey;
      }
      setTransportState((previous) => ({
        ...previous,
        mode: 'desktop-native',
      }));
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
      desktopPreviewUrlRef.current = committedUrl;
      desktopPreviewViewportRef.current = viewportKey;
      desktopPreviewVisibleRef.current = true;
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
          'Failed to open preview window: {errorMessage}',
          { errorMessage: error instanceof Error ? error.message : String(error) },
        ),
        capabilities: [],
      });
    } finally {
      desktopConnectingRef.current = false;
    }
  }, [createPreviewSessionId, createTransportHandlers, preferredTransportMode, teardownTransport]);

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
  });

  const handleToggleElementPicker = useCallback(async () => {
    if (!normalizedActiveUrlRef.current) return;

    if (isElementPickerEnabled) {
      setIsElementPickerEnabled(false);
      await Promise.resolve(transportControllerRef.current?.exitPickMode());
      dismissSelectionPopover(false);
      return;
    }

    if (preferredTransportMode === 'desktop-native') {
      if (!transportControllerRef.current) {
        await syncDesktopPreview();
      }
      await Promise.resolve(transportControllerRef.current?.enterPickMode());
      setIsElementPickerEnabled(true);
      return;
    }

    if (transportControllerRef.current && transportState.connected) {
      await Promise.resolve(transportControllerRef.current.enterPickMode());
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

    setIsElementPickerEnabled(true);
    void checkExtensionUpdate();
  }, [checkExtensionUpdate, connectIframeTransport, dismissSelectionPopover, isElementPickerEnabled, preferredTransportMode, setIsElementPickerEnabled, syncDesktopPreview, transportState.connected]);

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
    isMaximized,
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
    () => isTauriRuntime() && !isStandaloneBrowserWindow,
    [isStandaloneBrowserWindow],
  );

  const handleOpenPreviewBrowserWindow = useCallback(async () => {
    await openPreviewBrowserWindow({
      url: normalizedActiveUrl || activeUrl,
      workspaceId,
      projectId,
    });
    markStandaloneSurfaceOpen(standaloneSurfaceKey);
    setIsPreviewStandaloneOpen(true);
  }, [activeUrl, normalizedActiveUrl, projectId, standaloneSurfaceKey, workspaceId]);

  const handleReturnPreviewToEmbedded = useCallback(() => {
    restoreStandaloneSurface(standaloneSurfaceKey);
    setIsPreviewStandaloneOpen(false);
  }, [standaloneSurfaceKey]);

  const handleCloseStandalonePreviewWindow = useCallback(() => {
    restoreStandaloneSurface(standaloneSurfaceKey);
    void closeCurrentStandaloneWindow();
  }, [standaloneSurfaceKey]);

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
          'Element selection is only available for same-origin pages, local development URLs, or the desktop preview.',
        )
    : preferredTransportMode === 'desktop-native'
      ? previewT(
          'elementPicker.tooltip.desktopNative',
          '{action} element selection. Source component detection runs through the desktop native preview and supports React, Vue, Angular, and Svelte.',
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

  if (!isStandaloneBrowserWindow && isPreviewStandaloneOpen) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center border border-dashed border-border/60 bg-muted/10 px-6 text-center">
        <div className="max-w-sm">
          <div className="text-sm font-medium text-foreground">
            {previewToolbarT("standalone.embeddedTitle")}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {previewToolbarT("standalone.embeddedDescription")}
          </div>
          <button
            type="button"
            className="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
            onClick={handleReturnPreviewToEmbedded}
          >
            {previewToolbarT("standalone.returnHere")}
          </button>
        </div>
      </div>
    );
  }

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
              needsDesktopPreviewSafeInset: needsDesktopPreviewSafeInset && !effectiveIsToolbarHidden,
              openInWindowTitle: previewToolbarT("actions.openPreviewBrowserWindow"),
              returnToEmbeddedTitle: previewToolbarT("actions.returnToEmbeddedPreview"),
              toolbarToggleTitle,
              onOpenInWindow: canOpenPreviewBrowserWindow ? handleOpenPreviewBrowserWindow : undefined,
              onReturnToEmbedded: isStandaloneBrowserWindow ? handleCloseStandalonePreviewWindow : undefined,
              onToggleMaximized: handleToggleMaximized,
              onToggleToolbarHidden: handleToggleToolbarHidden,
            }}
          />
        ) : null
      }
      isChromeHidden={isChromeManagedByTabBar && effectiveIsToolbarHidden}
      isMaximized={isMaximized}
      previewRootRef={previewRootRef}
      toolbarProps={toolbarProps}
      toolbarHoverSuppressed={toolbarHoverSuppressed}
      viewportProps={viewportProps}
    />
  );
};
