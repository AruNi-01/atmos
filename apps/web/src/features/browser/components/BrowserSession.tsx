"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createTranslator, useTranslations } from 'next-intl';
import { useQueryStates } from "nuqs";
import { toastManager } from "@workspace/ui";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";

import { currentAppLocale } from "@/shared/lib/current-app-locale";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";
import { previewToolbarParams, type PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import type {
  PreviewHelperCapability,
  PreviewHelperPayload,
  PreviewHoverPayload,
} from "../lib/browser-helper/types";
import type {
  BrowserTransportMode,
  BrowserBridgeController,
  BrowserBridgeEventHandlers,
} from "../lib/browser-bridge/types";
import { connectSameOriginPreviewTransport } from "../lib/browser-transports/same-origin-transport";
import { connectExtensionPreviewTransport } from "../lib/browser-transports/extension-transport";
import { connectDesktopBrowserTransport, type DesktopBrowserAttachConfig, type DesktopBrowserBridgeController } from "../lib/browser-transports/desktop-transport";
import { useOverlayDismissOnWebview } from "../hooks/use-overlay-dismiss-on-webview";
import { useWebviewPointerPolicy } from "../hooks/use-webview-pointer-policy";
import { BrowserContent } from "./BrowserContent";
import { BrowserToolbar } from "./BrowserToolbar";
import { BrowserViewport } from "./BrowserViewport";
import { BrowserTabBar, type BrowserTabBarProps } from "./BrowserTabBar";
import { BrowserFavoritesListPopover } from "./BrowserFavoritesListPopover";
import { BrowserCookieImportDialog } from "./BrowserCookieImportDialog";
import { clearBrowserCache, clearBrowserSiteData } from "../lib/browser-cookie-commands";
import { useBrowserExtensionDownloads } from "../hooks/use-browser-extension-downloads";
import { useBrowserFavorites } from "../hooks/use-browser-favorites";
import { useBrowserIframeLoad } from "../hooks/use-browser-iframe-load";
import { useBrowserLifecycleEffects } from "../hooks/use-browser-lifecycle-effects";
import { useBrowserNavigation } from "../hooks/use-browser-navigation";
import { useBrowserSelection } from "../hooks/use-browser-selection";
import { useBrowserToolbarLayout } from "../hooks/use-browser-toolbar-layout";
import { useBrowserWindowState } from "../hooks/use-browser-window-state";
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
} from "../lib/browser-utils";

type ViewMode = PreviewViewMode;

interface BrowserSessionProps {
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
  browserTabBarProps?: Omit<BrowserTabBarProps, "chromeControls">;
  isStandaloneBrowserWindow?: boolean;
  isPreviewStandaloneOpen?: boolean;
  isMaximizedLayoutManaged?: boolean;
  allowMaximize?: boolean;
  canvasViewportControllerRef?: React.MutableRefObject<BrowserCanvasViewportController | null>;
  onOpenPreviewBrowserWindow?: (url: string) => Promise<void> | void;
  onCloseStandalonePreviewWindow?: () => void;
  onMoveToCenter?: () => void;
}

/**
 * Legacy hook for canvas camera/bounds sync against native WebContentsView.
 * APP-053 in-DOM <webview> sizes via CSS — methods are intentional no-ops.
 */
export interface BrowserCanvasViewportController {
  syncViewport: () => void;
  hide: () => void;
}

interface PreviewTransportState {
  mode: BrowserTransportMode | 'unavailable';
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
      namespace: 'browser',
    });
  }

  try {
    return cachedPreviewTranslator(key as never, values as never);
  } catch {
    return formatPreviewFallbackMessage(fallback, values);
  }
}


export const BrowserSession: React.FC<BrowserSessionProps> = ({
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
  canvasViewportControllerRef,
  onOpenPreviewBrowserWindow,
  onCloseStandalonePreviewWindow,
  onMoveToCenter,
}) => {
  const previewToolbarT = useTranslations("browser.toolbar");
  const headerHasOpenOverlay = useDialogStore(s => s.headerHasOpenOverlay);
  const isGlobalSearchOpen = useDialogStore(s => s.isGlobalSearchOpen);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeSrc, setIframeSrc] = useState(activeUrl);
  const [requestedIframeUrl, setRequestedIframeUrl] = useState(activeUrl);
  const [navigationToken, setNavigationToken] = useState(0);
  const [desktopCommittedUrl, setDesktopCommittedUrl] = useState(activeUrl);
  const desktopCommittedUrlRef = useRef(activeUrl);
  const [isElementPickerTooltipOpen, setIsElementPickerTooltipOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoadingState] = useState(false);
  const [previewLoadError, setPreviewLoadError] = useState<PreviewLoadError | null>(null);
  const [hoverCursorLabel, setHoverCursorLabel] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
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
  }, setBrowserToolbarParams] = useQueryStates({
    pvView: previewToolbarParams.pvView,
    pvToolbar: previewToolbarParams.pvToolbar,
  });
  const viewMode: ViewMode = viewModeParam === "mobile" ? "mobile" : "desktop";
  const isToolbarHidden = isToolbarHiddenParam;
  // Element pick is per Preview instance (one per browser tab) — never shared via URL.
  const [isElementPickerEnabled, setLocalIsElementPickerEnabled] = useState(false);
  const isElementPickerEnabledRef = useRef(false);
  isElementPickerEnabledRef.current = isElementPickerEnabled;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const desktopViewportRef = useRef<HTMLDivElement | null>(null);
  const desktopAttachRef = useRef<DesktopBrowserAttachConfig | null>(null);
  const [desktopAttach, setDesktopAttach] = useState<DesktopBrowserAttachConfig | null>(null);
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const iframeUrlWatcherCleanupRef = useRef<(() => void) | null>(null);
  const transportControllerRef = useRef<BrowserBridgeController | null>(null);
  const transportSessionIdRef = useRef<string | null>(null);
  const desktopPreviewUrlRef = useRef<string | null>(null);
  const desktopPreviewViewportRef = useRef<string | null>(null);
  const desktopPreviewVisibleRef = useRef(false);
  const isPreviewLoadingRef = useRef(false);
  const forceDesktopNavigationRef = useRef(false);

  useEffect(() => {
    if (!isElementPickerEnabled) {
      setHoverCursorLabel(null);
    }
  }, [isElementPickerEnabled]);
  const desktopConnectingRef = useRef(false);
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
  } = useBrowserWindowState({
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
    void setBrowserToolbarParams({ pvView: nextViewMode });
  }, [setBrowserToolbarParams]);

  const setIsElementPickerEnabled = useCallback((nextIsElementPickerEnabled: boolean) => {
    isElementPickerEnabledRef.current = nextIsElementPickerEnabled;
    setLocalIsElementPickerEnabled(nextIsElementPickerEnabled);
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
  } = useBrowserFavorites({
    currentPageTitle,
    normalizedActiveUrl,
  });
  const preferredTransportMode = useMemo<BrowserTransportMode | 'unavailable'>(() => {
    if (!normalizedActiveUrl || typeof window === "undefined") return 'unavailable';

    try {
      if (isDesktopRuntime()) {
        return 'desktop';
      }
      const nextUrl = new URL(normalizedActiveUrl);
      if (nextUrl.origin === window.location.origin) {
        return 'same-origin';
      }
      return isLocalPreviewTarget(normalizedActiveUrl) ? 'extension' : 'unavailable';
    } catch {
      return isDesktopRuntime() ? 'desktop' : 'unavailable';
    }
  }, [normalizedActiveUrl]);
  // NOTE: Do not suspend based on right-sidebar collapse — that used to hide
  // *every* desktop surface (including center browsers). Sidebar
  // visibility is handled via BrowserPanel `isActive` in RightSidebar instead.
  // In-DOM webview: overlays stack with z-index — do not hide the live guest for menus.
  // Only "suspend" layout when this tab is not the active surface (handled via CSS) or standalone handoff.
  const shouldSuspendDesktopPreview =
      preferredTransportMode === 'desktop' && (
        (!isStandaloneBrowserWindow && isPreviewStandaloneOpen) ||
        !isActive
      );
  const desktopPointerBlocked = useWebviewPointerPolicy(
    preferredTransportMode === 'desktop' && isActive && !shouldSuspendDesktopPreview,
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
  } = useBrowserExtensionDownloads({
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
    handleDesktopViewportChanged,
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
  } = useBrowserSelection({
    desktopViewportRef,
    iframeRef,
    isElementPickerEnabledRef,
    transportControllerRef,
  });

  // Only auto-dismiss when the picker is off. While pick mode is on, guest clicks
  // intentionally select elements and must open the host SelectionPopover — webview
  // focus/blur must not race-close it.
  useOverlayDismissOnWebview(
    () => {
      dismissSelectionPopover(false);
    },
    preferredTransportMode === 'desktop' && isActive && !isElementPickerEnabled,
  );


  useLayoutEffect(() => {
    if (preferredTransportMode === 'desktop') {
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
      desktopAttachRef.current = null;
      setDesktopAttach(null);
    extensionConnectingRef.current = false;
    if (activeController) {
      void Promise.resolve(activeController.destroy()).catch(() => undefined);
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
  } = useBrowserNavigation({
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
    mode: BrowserTransportMode,
    extraHandlers?: BrowserBridgeEventHandlers,
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
      setHoverCursorLabel(null);
      handleSelectedPayload(mode, payload);
      extraHandlers?.onSelected?.(payload);
    },
    onHover: (payload: PreviewHoverPayload | null) => {
      if (!payload || mode === 'desktop') {
        setHoverCursorLabel(null);
        extraHandlers?.onHover?.(payload);
        return;
      }

      const bounds = iframeRef.current?.getBoundingClientRect();
      if (!bounds) {
        setHoverCursorLabel(null);
        extraHandlers?.onHover?.(payload);
        return;
      }

      setHoverCursorLabel({
        label: payload.label,
        x: bounds.left + payload.cursor.x,
        y: bounds.top + payload.cursor.y,
      });
      extraHandlers?.onHover?.(payload);
    },
    onToolbarAction: (
      action: 'copy' | 'add' | 'update' | 'delete',
      note?: string,
      annotationId?: string,
      selectionSnapshot?: PreviewHelperPayload,
    ) => {
      if (mode === 'desktop' && action === 'copy') {
        if (selectionSnapshot) {
          handleSelectedPayload(mode, selectionSnapshot);
        }
        void handleDesktopToolbarCopy(note);
      } else if (mode === 'desktop' && action === 'add') {
        if (selectionSnapshot) {
          handleSelectedPayload(mode, selectionSnapshot);
        }
        handleAddSelectionAnnotation(note, undefined, annotationId);
      } else if (mode === 'desktop' && action === 'update') {
        handleUpdateSelectionAnnotation(annotationId, note);
      } else if (mode === 'desktop' && action === 'delete') {
        handleDeleteSelectionAnnotation(annotationId);
      }
      extraHandlers?.onToolbarAction?.(action, note, annotationId, selectionSnapshot);
    },
    onCleared: () => {
      setHoverCursorLabel(null);
      dismissSelectionPopover(false);
      extraHandlers?.onCleared?.();
    },
    onError: (message: string) => {
      setHoverCursorLabel(null);
      if (mode === 'extension') {
        extensionConnectingRef.current = false;
      }
      if (mode === 'desktop') {
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
      setHoverCursorLabel(null);
      if (mode === 'desktop') {
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
      // Favicon-only native events may pass an empty title — do not wipe a good one.
      if (pageTitle.trim()) {
        setNormalizedCurrentPageTitle(pageTitle, pageUrl);
      }
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
    onViewportChanged: () => {
      handleDesktopViewportChanged();
      extraHandlers?.onViewportChanged?.();
    },
  }), [
    dismissSelectionPopover,
    handleAddSelectionAnnotation,
    handleDeleteSelectionAnnotation,
    handleDesktopToolbarCopy,
    handleDesktopViewportChanged,
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
    if (preferredTransportMode !== 'desktop' || !committedUrl || !desktopViewportRef.current) {
      if (transportControllerRef.current?.mode === 'desktop') {
        teardownTransport(false);
      }
      return;
    }

    if (transportControllerRef.current?.mode === 'desktop' && transportSessionIdRef.current) {
      // Session already open: host webview owns load via desktopSrc=committedUrl.
      // Only bookkeep URL refs — never dual-call main navigate + webview loadURL.
      forceDesktopNavigationRef.current = false;
      desktopPreviewUrlRef.current = committedUrl;
      setPreviewLoadError(null);
      // Loading flag is owned by webview did-start/stop-loading for desktop.
      setTransportState((previous) =>
        previous.mode === 'desktop'
          ? previous
          : {
              ...previous,
              mode: 'desktop',
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
      const controller = await connectDesktopBrowserTransport({
        sessionId,
        pageUrl: committedUrl,
        ...createTransportHandlers('desktop'),
      }) as DesktopBrowserBridgeController;
      transportControllerRef.current = controller;
      desktopAttachRef.current = controller.attach;
      setDesktopAttach(controller.attach);
      forceDesktopNavigationRef.current = false;
      desktopPreviewUrlRef.current = committedUrl;
      desktopPreviewVisibleRef.current = true;
      setPreviewLoadError(null);
      // Keep host loading chrome until webview did-stop-loading / dom-ready.
      // Clearing here caused a white flash before the page painted.
      setTransportState({
        mode: 'desktop',
        connected: true,
        message: '',
        capabilities: [],
      });
    } catch (error) {
      console.error('[browser] desktop transport connect failed:', error);
      desktopCommittedUrlRef.current = "";
      setDesktopCommittedUrl("");
      setDesktopAttach(null);
      desktopAttachRef.current = null;
      setPreviewLoadError(createPreviewNetworkError(committedUrl, error));
      setIsPreviewLoading(false);
      setTransportState({
        mode: 'desktop',
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
    if (preferredTransportMode !== 'desktop' || !desktopCommittedUrlRef.current) return;
    if (transportControllerRef.current?.mode !== 'desktop') {
      await syncDesktopPreview();
      return;
    }
    desktopPreviewVisibleRef.current = true;
  }, [preferredTransportMode, syncDesktopPreview]);

  const hideDesktopPreview = useCallback(async () => {
    // CSS owns visibility for in-DOM webview; keep flag for legacy callers.
    desktopPreviewVisibleRef.current = false;
  }, []);

  const requestNativeSurfaceChromeBoundsSync = useCallback(() => {
    if (
      preferredTransportMode !== 'desktop' ||
      shouldSuspendDesktopPreview ||
      typeof window === 'undefined'
    ) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void showDesktopPreview();
      });
    });
  }, [preferredTransportMode, shouldSuspendDesktopPreview, showDesktopPreview]);

  // APP-053: canvas no longer drives native bounds. Export a no-op controller
  // so canvas widgets keep a stable ref shape without show/hide thrash.
  useEffect(() => {
    if (!canvasViewportControllerRef) return;
    const controller: BrowserCanvasViewportController = {
      syncViewport: () => {
        /* in-DOM webview — CSS layout */
      },
      hide: () => {
        /* no native surface to hide */
      },
    };
    canvasViewportControllerRef.current = controller;
    return () => {
      if (canvasViewportControllerRef.current === controller) {
        canvasViewportControllerRef.current = null;
      }
    };
  }, [canvasViewportControllerRef]);

  const handleOpenDeveloperTools = useCallback(async () => {
    if (preferredTransportMode !== 'desktop') return;

    try {
      if (transportControllerRef.current?.mode !== 'desktop') {
        await syncDesktopPreview();
      }
      const controller = transportControllerRef.current;
      if (controller?.mode !== 'desktop' || !controller.openDevTools) {
        throw new Error('Desktop Browser is not ready for developer tools.');
      }
      await controller.openDevTools();
    } catch (error) {
      console.error('[browser] failed to open developer tools:', error);
      toastManager.add({
        title: previewT('developerTools.openFailedTitle', 'Failed to open developer tools'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      });
    }
  }, [preferredTransportMode, previewT, syncDesktopPreview]);

  const handleIframeLoad = useBrowserIframeLoad({
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

  useBrowserLifecycleEffects({
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
      // Flip UI first so the pressed state clears immediately.
      isElementPickerEnabledRef.current = false;
      setIsElementPickerEnabled(false);
      const viewport = desktopViewportRef.current;
      if (viewport) viewport.style.cursor = '';
      await Promise.resolve(transportControllerRef.current?.exitPickMode());
      dismissSelectionPopover(false);
      return;
    }

    // Flip UI first so the toolbar stays highlighted even if enterPickMode is slow.
    isElementPickerEnabledRef.current = true;
    setIsElementPickerEnabled(true);

    if (preferredTransportMode === 'desktop') {
      if (!transportControllerRef.current) {
        await syncDesktopPreview();
      }
      await Promise.resolve(transportControllerRef.current?.enterPickMode());
      return;
    }

    if (transportControllerRef.current && transportState.connected) {
      await Promise.resolve(transportControllerRef.current.enterPickMode());
      return;
    }

    const installed = await connectIframeTransport();
    if (!installed) {
      isElementPickerEnabledRef.current = false;
      setIsElementPickerEnabled(false);
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
  } = useBrowserToolbarLayout({
    isToolbarHidden,
    resolvedTransportMode,
    setToolbarHiddenParam: (nextIsToolbarHidden) => {
      void setBrowserToolbarParams({ pvToolbar: nextIsToolbarHidden });
    },
  });

  const handleToggleToolbarHidden = useCallback(() => {
    setIsToolbarHidden(!effectiveIsToolbarHidden);
  }, [effectiveIsToolbarHidden, setIsToolbarHidden]);

  const handleToggleMaximized = useCallback(() => {
    setIsMaximized((current) => !current);
  }, [setIsMaximized]);

  // APP-041 Browser Cookie Sync — desktop + macOS only. The exact macOS 14+ gate
  // is enforced by the desktop layer (returns `UnsupportedPlatform`, surfaced in
  // the dialog); here we only decide whether the menu items are eligible to show.
  const cookieToolsAvailable = useMemo(
    () =>
      isDesktopRuntime() &&
      typeof navigator !== "undefined" &&
      /Mac/i.test(navigator.userAgent),
    [],
  );
  const [importCookiesDialogOpen, setImportCookiesDialogOpen] = useState(false);

  const handleImportCookies = useCallback(() => {
    setImportCookiesDialogOpen(true);
  }, []);

  // Clear handlers invoke the command then reload the active surface (reload
  // contract). They rethrow so the confirm popover can render an inline error;
  // there is intentionally no success toast (repo Inline-Feedback rule).
  const handleClearCache = useCallback(async () => {
    await clearBrowserCache();
    handleRefresh();
  }, [handleRefresh]);

  const handleClearSiteData = useCallback(async () => {
    await clearBrowserSiteData();
    handleRefresh();
  }, [handleRefresh]);

  const canOpenPreviewBrowserWindow = useMemo(
    () =>
      isDesktopRuntime() &&
      !isStandaloneBrowserWindow &&
      Boolean(onOpenPreviewBrowserWindow),
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
    : preferredTransportMode === 'desktop'
      ? previewT(
          'elementPicker.tooltip.desktop',
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
  const toolbarProps: React.ComponentProps<typeof BrowserToolbar> = {
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

  const viewportProps: React.ComponentProps<typeof BrowserViewport> = {
    activeUrl,
    desktopViewportRef,
    desktopAttach,
    desktopSrc: desktopCommittedUrl || desktopPreviewUrlRef.current || '',
    desktopPointerEventsNone: desktopPointerBlocked || favoritesListOpen || favoritePopoverOpen || headerHasOpenOverlay || isGlobalSearchOpen,
    desktopLayoutHidden: shouldSuspendDesktopPreview,
    onDesktopBindGuest: (webContentsId: number) => {
      const c = transportControllerRef.current as DesktopBrowserBridgeController | null;
      if (c && typeof c.bindGuest === 'function') {
        void c.bindGuest(webContentsId);
      }
    },
    onDesktopLoadingChange: setIsPreviewLoading,
    dismissSelectionPopover,
    favoritesListOpen,
    handleIframeLoad,
    handleRefresh,
    iframeKey,
    iframeRef,
    iframeSrc,
    hoverCursorLabel,
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
    <>
      <BrowserContent
      browserTabBar={
        browserTabBarProps ? (
          <BrowserTabBar
            {...browserTabBarProps}
            chromeControls={{
              favoritesList: (
                <BrowserFavoritesListPopover
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
              openInWindowTitle: previewToolbarT("actions.openBrowserWindow"),
              returnToEmbeddedTitle: previewToolbarT("actions.returnToEmbeddedPreview"),
              moveToCenterTitle: previewToolbarT("browserTabs.moveToCenter"),
              toolbarToggleTitle,
              onOpenInWindow: canOpenPreviewBrowserWindow ? handleOpenPreviewBrowserWindow : undefined,
              onReturnToEmbedded: isStandaloneBrowserWindow ? handleCloseStandalonePreviewWindow : undefined,
              onMoveToCenter:
                onMoveToCenter && !isStandaloneBrowserWindow ? onMoveToCenter : undefined,
              onToggleMaximized:
                allowMaximize && !isStandaloneBrowserWindow
                  ? handleToggleMaximized
                  : undefined,
              onToggleToolbarHidden: handleToggleToolbarHidden,
              cookieToolsAvailable,
              onImportCookies: cookieToolsAvailable ? handleImportCookies : undefined,
              onClearCache: cookieToolsAvailable ? handleClearCache : undefined,
              onClearSiteData: cookieToolsAvailable ? handleClearSiteData : undefined,
            }}
          />
        ) : null
      }
      isChromeHidden={isChromeManagedByTabBar && effectiveIsToolbarHidden}
      isMaximized={isMaximized}
      isMaximizedLayoutManaged={isMaximizedLayoutManaged}
      onNativeSurfaceChromeLayoutChange={requestNativeSurfaceChromeBoundsSync}
      previewRootRef={previewRootRef}
      reserveNativeSurfaceChromeSpace={
        effectiveIsToolbarHidden && resolvedTransportMode === 'desktop'
      }
      toolbarProps={toolbarProps}
      toolbarHoverSuppressed={toolbarHoverSuppressed}
      viewportProps={viewportProps}
    />
      {cookieToolsAvailable ? (
        <BrowserCookieImportDialog
          open={importCookiesDialogOpen}
          onOpenChange={setImportCookiesDialogOpen}
          onReloadActiveTab={handleRefresh}
        />
      ) : null}
    </>
  );
};
