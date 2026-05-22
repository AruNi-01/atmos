"use client";

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryStates } from "nuqs";
import { toastManager } from "@workspace/ui";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import { previewToolbarParams, type PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
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
  isLocalPreviewTarget,
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
  workspaceId?: string | null;
  projectId?: string;
}

interface PreviewTransportState {
  mode: PreviewTransportMode | 'unavailable';
  connected: boolean;
  message: string;
  capabilities: string[];
}


export const Preview: React.FC<PreviewProps> = ({
  url,
  setUrl,
  activeUrl,
  setActiveUrl,
  isActive = true,
}) => {
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
  const desktopConnectingRef = useRef(false);
  const iframeLoadResolveRef = useRef<(() => void) | null>(null);
  const extensionVersionRef = useRef<string | null>(null);
  const extensionConnectingRef = useRef(false);
  const {
    isMaximized,
    needsDesktopPreviewSafeInset,
    setIsMaximized,
  } = usePreviewWindowState();

  const setViewMode = useCallback((nextViewMode: ViewMode) => {
    void setPreviewToolbarParams({ pvView: nextViewMode });
  }, [setPreviewToolbarParams]);

  const setIsElementPickerEnabled = useCallback((nextIsElementPickerEnabled: boolean) => {
    void setPreviewToolbarParams({ pvPick: nextIsElementPickerEnabled });
  }, [setPreviewToolbarParams]);

  const normalizedActiveUrl = useMemo(() => canonicalizeUrl(activeUrl), [activeUrl]);
  const normalizedActiveUrlRef = useRef(normalizedActiveUrl);
  normalizedActiveUrlRef.current = normalizedActiveUrl;
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
    handleDesktopToolbarCopy,
    handleSelectedPayload,
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
    extensionConnectingRef.current = false;
    if (activeController) {
      void Promise.resolve(activeController.destroy());
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
    setCurrentPageTitle(title);
    setTransportState((previous) => ({
      ...previous,
      mode: 'same-origin',
      connected: previous.mode === 'same-origin' ? previous.connected : false,
      message: "",
    }));

    return access;
  }, [getIframeAccess, preferredTransportMode]);

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
    ) => {
      if (extensionVersion) {
        extensionVersionRef.current = extensionVersion;
      }
      if (mode === 'extension') {
        extensionConnectingRef.current = false;
      }
      if (pageTitle !== undefined) {
        setCurrentPageTitle(pageTitle);
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
      extraHandlers?.onReady?.(capabilities, extensionVersion, pageTitle);
    },
    onSelected: (payload: PreviewHelperPayload) => {
      handleSelectedPayload(mode, payload);
      extraHandlers?.onSelected?.(payload);
    },
    onToolbarAction: (action: 'copy', note?: string) => {
      if (mode === 'desktop-native' && action === 'copy') {
        void handleDesktopToolbarCopy(note);
      }
      extraHandlers?.onToolbarAction?.(action, note);
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
    onNavigationChanged: (nextUrl: string, pageTitle?: string) => {
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
      setUrl(nextUrl);
      setActiveUrl(nextUrl);
      if (pageTitle !== undefined) {
        setCurrentPageTitle(pageTitle);
      }
      if (skipExternalHistorySyncRef.current) {
        skipExternalHistorySyncRef.current = false;
      } else {
        pushHistoryEntry(nextUrl);
      }
      extraHandlers?.onNavigationChanged?.(nextUrl, pageTitle);
    },
    onTitleChanged: (pageTitle: string) => {
      setCurrentPageTitle(pageTitle);
      extraHandlers?.onTitleChanged?.(pageTitle);
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
    handleDesktopToolbarCopy,
    handleSelectedPayload,
    pushHistoryEntry,
    setActiveUrl,
    setUrl,
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
      setTransportState({
        mode: 'desktop-native',
        connected: true,
        message: '',
        capabilities: [],
      });
    } catch (error) {
      console.error('[preview] desktop transport connect failed:', error);
      setTransportState({
        mode: 'desktop-native',
        connected: false,
        message: `Failed to open preview window: ${error instanceof Error ? error.message : String(error)}`,
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
    await transportControllerRef.current.show?.();
    await transportControllerRef.current.updateViewport?.(await getPreviewViewportBounds(desktopViewportRef.current));
  }, [preferredTransportMode, syncDesktopPreview]);

  const hideDesktopPreview = useCallback(async () => {
    if (transportControllerRef.current?.mode !== 'desktop-native') return;
    await transportControllerRef.current.hide?.();
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
    setActiveUrl,
    setCurrentPageTitle,
    setIsPreviewLoading,
    setPreviewLoadError,
    setUrl,
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
        title: "Element picker unavailable",
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
    shouldShowToolbarToggle,
    shouldStackPreviewHomeCards,
    shouldStackPreviewHomeNotes,
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
  const transportModeLabel = resolvedTransportMode === 'desktop-native'
    ? 'Desktop'
    : resolvedTransportMode === 'extension'
      ? transportState.connected ? 'Extension' : 'Extension required'
      : resolvedTransportMode === 'same-origin'
        ? 'Same-origin'
        : 'Unavailable';
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
          title: 'Extension not detected',
          description: PREVIEW_EXTENSION_REQUIRED_MESSAGE,
        });
      }
    } finally {
      setIsRecheckingExtension(false);
    }
  }, [connectIframeTransport, isRecheckingExtension, preferredTransportMode, setIsRecheckingExtension]);

  const elementPickerTitle = !activeUrl
    ? "Enter a URL first"
    : preferredTransportMode === 'unavailable'
      ? "Element picker unavailable"
    : isElementPickerEnabled
      ? "Disable element picker"
      : "Enable element picker";
  const elementPickerTooltip = !activeUrl
    ? "Enter a URL first."
    : preferredTransportMode === 'unavailable'
      ? "Element selection is only available for same-origin pages, local development URLs, or the desktop preview."
    : preferredTransportMode === 'desktop-native'
      ? `${isElementPickerEnabled ? "Disable" : "Enable"} element selection. Source component detection runs through the desktop native preview and supports React, Vue, Angular, and Svelte.`
      : preferredTransportMode === 'extension'
        ? `${isElementPickerEnabled ? "Disable" : "Enable"} element selection. Cross-port pages use the Atmos Inspector extension. Source component detection supports React, Vue, Angular, and Svelte.`
        : `${isElementPickerEnabled ? "Disable" : "Enable"} element selection. Source component detection supports React, Vue, Angular, and Svelte.`;
  const toolbarProps: React.ComponentProps<typeof PreviewToolbar> = {
    activeFavorite,
    activeUrl,
    canGoBack,
    canGoForward,
    desktopToolbarExpanded,
    displayPageTitle,
    displayUrlParts,
    effectiveIsToolbarHidden,
    elementPickerTitle,
    elementPickerTooltip,
    extensionDownloadStarted,
    extensionPopoverOpen,
    extensionUpdateAvailable,
    extensionUpdatePopoverOpen,
    favoriteNameDraft,
    favoritePopoverOpen,
    favoriteSearch,
    favorites,
    favoritesListOpen,
    filteredFavorites,
    isDownloadingExtension,
    isElementPickerEnabled,
    isElementPickerTooltipOpen,
    isMaximized,
    isRecheckingExtension,
    isUrlInputFocused,
    needsDesktopPreviewSafeInset,
    normalizedActiveUrl,
    preferredTransportMode,
    renameDraft,
    renamingUrl,
    savingFavorite,
    shouldHideToolbarExternalActions,
    shouldHideToolbarNavigation,
    shouldHideToolbarStatus,
    shouldHideToolbarViewControls,
    shouldShowExtensionInstall,
    shouldShowToolbarToggle,
    shouldUseCompactToolbar,
    toolbarHoverSuppressed,
    toolbarRowRef,
    toolbarToggleTitle,
    transportModeLabel,
    url,
    urlInputRef,
    userEditedUrlRef,
    usesDesktopToolbarExpand,
    usesToolbarHoverOverlay,
    viewMode,
    focusUrlInput,
    handleAddFavorite,
    handleDeleteFavorite,
    handleDownloadExtension,
    handleDownloadExtensionUpdate,
    handleGoBack,
    handleGoForward,
    handleGoHome,
    handleRefresh,
    handleRenameFavorite,
    handleRecheckExtension,
    handleToggleElementPicker,
    handleUrlInputBlur,
    navigateToUrl,
    setDesktopToolbarHovered,
    setExtensionPopoverOpen,
    setExtensionUpdatePopoverOpen,
    setFavoriteNameDraft,
    setFavoritePopoverOpen,
    setFavoriteSearch,
    setFavoritesListOpen,
    setIsElementPickerTooltipOpen,
    setIsMaximized,
    setIsToolbarHidden,
    setRenameDraft,
    setRenamingUrl,
    setUrl,
    setViewMode,
  };

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
    previewLoadError,
    requestedIframeUrl,
    resolvedTransportMode,
    selectionInfo,
    selectionPopoverExpanded,
    selectionPopoverPosition,
    selectionPopoverRef,
    selectionPopoverVisible,
    setSelectionPopoverExpanded,
    shouldStackPreviewHomeCards,
    shouldStackPreviewHomeNotes,
    transportMessage: transportState.message,
    viewMode,
  };

  return (
    <PreviewContent
      isMaximized={isMaximized}
      previewRootRef={previewRootRef}
      toolbarProps={toolbarProps}
      viewportProps={viewportProps}
    />
  );
};
