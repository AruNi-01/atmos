"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryStates } from "nuqs";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FolderHeart,
  Home,
  Maximize,
  Minimize,
  Monitor,
  PanelTopClose,
  PanelTopOpen,
  Pencil,
  RotateCw,
  Search,
  SquareMousePointer,
  Smartphone,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TextShimmer,
  cn,
  toastManager,
} from "@workspace/ui";
import { fetchExtensionDownload, fetchExtensionVersion } from "@/api/preview";
import { functionSettingsApi } from "@/api/ws-api";
import { isTauriRuntime } from "@/lib/desktop-runtime";
import { previewToolbarParams, type PreviewViewMode } from "@/lib/nuqs/searchParams";
import { SelectionPopover } from "@/components/selection/SelectionPopover";
import { formatPreviewSelectionForAI, type SelectionInfo } from "@/lib/format-selection-for-ai";
import type { PreviewHelperCapability, PreviewHelperPayload } from "./preview-helper/types";
import type {
  PreviewTransportMode,
  PreviewBridgeController,
  PreviewBridgeEventHandlers,
} from "./preview-bridge/types";
import { connectSameOriginPreviewTransport } from "./preview-transports/same-origin-transport";
import { connectExtensionPreviewTransport } from "./preview-transports/extension-transport";
import {
  connectDesktopPreviewTransport,
  getPreviewViewportBounds,
} from "./preview-transports/desktop-transport";

type ViewMode = PreviewViewMode;

interface FavoriteSite {
  url: string;
  name?: string;
}

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

const PREVIEW_SELECTION_UNAVAILABLE_MESSAGE =
  "Element selection is only available for same-origin or local preview pages.";
const PREVIEW_EXTENSION_REQUIRED_MESSAGE =
  "Cross-port element selection requires the Atmos Inspector extension. Pages that reject iframe embedding must use the desktop preview.";

const MAX_HISTORY_LENGTH = 100;

const normalizeUrl = (value: string): string => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//.test(trimmed) === false && /^https?:/.test(trimmed)) {
    return trimmed.replace(/^(https?):/, "$1://");
  }

  if (!/^https?:\/\//.test(trimmed)) {
    const isLocal =
      /^(localhost|127\.0\.0\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\])(?::\d+)?(?:[/?#]|$)/.test(
        trimmed,
      );
    return isLocal ? `http://${trimmed}` : `https://${trimmed}`;
  }

  return trimmed;
};

const canonicalizeUrl = (value: string): string => {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";

  try {
    return new URL(normalized).toString();
  } catch {
    return normalized;
  }
};

const isLocalPreviewTarget = (value: string): boolean => {
  if (!value) return false;

  try {
    const { hostname } = new URL(value);
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      /^127\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^192\.168\.\d+\.\d+$/.test(hostname)
    );
  } catch {
    return false;
  }
};

const deriveFavoriteName = (title: string, url: string): string => {
  const trimmedTitle = title.trim();
  if (trimmedTitle) return trimmedTitle;

  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const splitDisplayUrl = (value: string): { protocol: string; address: string } => {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return { protocol: "", address: "" };
  }

  try {
    const parsed = new URL(normalized);
    return {
      protocol: `${parsed.protocol}//`,
      address: `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`,
    };
  } catch {
    const matched = normalized.match(/^(https?:\/\/)(.*)$/i);
    if (matched) {
      return {
        protocol: matched[1],
        address: matched[2],
      };
    }
    return {
      protocol: "",
      address: normalized,
    };
  }
};

export const Preview: React.FC<PreviewProps> = ({
  url,
  setUrl,
  activeUrl,
  setActiveUrl,
  isActive = true,
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeSrc, setIframeSrc] = useState(activeUrl);
  const [isElementPickerTooltipOpen, setIsElementPickerTooltipOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [favorites, setFavorites] = useState<FavoriteSite[]>([]);
  const [favoritePopoverOpen, setFavoritePopoverOpen] = useState(false);
  const [favoritesListOpen, setFavoritesListOpen] = useState(false);
  const [extensionPopoverOpen, setExtensionPopoverOpen] = useState(false);
  const [extensionDownloadStarted, setExtensionDownloadStarted] = useState(false);
  const [isDownloadingExtension, setIsDownloadingExtension] = useState(false);
  const [isRecheckingExtension, setIsRecheckingExtension] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const [favoriteNameDraft, setFavoriteNameDraft] = useState("");
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [currentPageTitle, setCurrentPageTitle] = useState("");
  const [isUrlInputFocused, setIsUrlInputFocused] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [renamingUrl, setRenamingUrl] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isDesktopWindowFullscreen, setIsDesktopWindowFullscreen] = useState(false);
  const [transportState, setTransportState] = useState<PreviewTransportState>({
    mode: 'unavailable',
    connected: false,
    message: '',
    capabilities: [],
  });
  const [selectionPopoverVisible, setSelectionPopoverVisible] = useState(false);
  const [selectionPopoverExpanded, setSelectionPopoverExpanded] = useState(false);
  const [selectionPopoverPosition, setSelectionPopoverPosition] = useState({ x: 0, y: 0 });
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
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
  const toolbarRowRef = useRef<HTMLDivElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const selectionPopoverRef = useRef<HTMLDivElement | null>(null);
  const historyIndexRef = useRef(-1);
  const skipExternalHistorySyncRef = useRef(false);
  const iframeUrlWatcherCleanupRef = useRef<(() => void) | null>(null);
  const transportControllerRef = useRef<PreviewBridgeController | null>(null);
  const transportSessionIdRef = useRef<string | null>(null);
  const desktopPreviewUrlRef = useRef<string | null>(null);
  const desktopPreviewViewportRef = useRef<string | null>(null);
  const desktopConnectingRef = useRef(false);
  const iframeLoadResolveRef = useRef<(() => void) | null>(null);
  const extensionVersionRef = useRef<string | null>(null);
  const extensionConnectingRef = useRef(false);
  const [extensionUpdateAvailable, setExtensionUpdateAvailable] = useState(false);
  const [extensionUpdatePopoverOpen, setExtensionUpdatePopoverOpen] = useState(false);
  const isMacDesktop = useMemo(
    () => isTauriRuntime() && typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent),
    [],
  );

  const setViewMode = useCallback((nextViewMode: ViewMode) => {
    void setPreviewToolbarParams({ pvView: nextViewMode });
  }, [setPreviewToolbarParams]);

  const [toolbarHoverSuppressed, setToolbarHoverSuppressed] = useState(false);
  const toolbarSuppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setIsToolbarHidden = useCallback((nextIsToolbarHidden: boolean) => {
    if (nextIsToolbarHidden) {
      setToolbarHoverSuppressed(true);
      if (toolbarSuppressTimerRef.current) clearTimeout(toolbarSuppressTimerRef.current);
      toolbarSuppressTimerRef.current = setTimeout(() => setToolbarHoverSuppressed(false), 400);
    }
    void setPreviewToolbarParams({ pvToolbar: nextIsToolbarHidden });
  }, [setPreviewToolbarParams]);

  const setIsElementPickerEnabled = useCallback((nextIsElementPickerEnabled: boolean) => {
    void setPreviewToolbarParams({ pvPick: nextIsElementPickerEnabled });
  }, [setPreviewToolbarParams]);

  const normalizedActiveUrl = useMemo(() => canonicalizeUrl(activeUrl), [activeUrl]);
  const normalizedDraftUrl = useMemo(() => canonicalizeUrl(url ?? ""), [url]);
  const displayUrlParts = useMemo(() => splitDisplayUrl(url ?? ""), [url]);
  const displayPageTitle = useMemo(
    () => (normalizedDraftUrl && normalizedDraftUrl === normalizedActiveUrl ? currentPageTitle.trim() : ""),
    [currentPageTitle, normalizedActiveUrl, normalizedDraftUrl],
  );
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
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const activeFavorite = useMemo(
    () => favorites.find((site) => canonicalizeUrl(site.url) === normalizedActiveUrl) ?? null,
    [favorites, normalizedActiveUrl],
  );

  const filteredFavorites = useMemo(() => {
    const query = favoriteSearch.trim().toLowerCase();
    if (!query) return favorites;

    return favorites.filter((site) => {
      const name = site.name?.toLowerCase() ?? "";
      const targetUrl = site.url.toLowerCase();
      return name.includes(query) || targetUrl.includes(query);
    });
  }, [favoriteSearch, favorites]);

  const persistFavorites = useCallback(async (nextFavorites: FavoriteSite[]) => {
    setSavingFavorite(true);
    try {
      await functionSettingsApi.update("inner_browser", "favorite_site", nextFavorites);
      setFavorites(nextFavorites);
      return true;
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to save favorite",
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    } finally {
      setSavingFavorite(false);
    }
  }, []);

  const pushHistoryEntry = useCallback((finalUrl: string) => {
    setHistory((prev) => {
      const currentIndex = historyIndexRef.current;
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
      if (canonicalizeUrl(finalUrl) !== normalizedActiveUrl) {
        setCurrentPageTitle("");
      }
      skipExternalHistorySyncRef.current = true;
      setUrl(finalUrl);
      setActiveUrl(finalUrl);
      setIframeSrc(finalUrl);
      setIframeKey((prev) => prev + 1);

      if (!pushHistory) return;
      pushHistoryEntry(finalUrl);
    },
    [normalizedActiveUrl, pushHistoryEntry, setActiveUrl, setUrl],
  );

  const focusUrlInput = useCallback(() => {
    setIsUrlInputFocused(true);
    window.requestAnimationFrame(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    });
  }, []);

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

  useEffect(() => {
    let mounted = true;

    const loadFavorites = async () => {
      try {
        const settings = await functionSettingsApi.get();
        const sites = Array.isArray(settings.inner_browser?.favorite_site)
          ? settings.inner_browser.favorite_site.filter(
              (site): site is FavoriteSite =>
                !!site &&
                typeof site === "object" &&
                typeof site.url === "string" &&
                (typeof site.name === "string" || typeof site.name === "undefined"),
            )
          : [];

        if (mounted) {
          setFavorites(sites);
        }
      } catch (error) {
        console.error("Failed to load preview favorites:", error);
      }
    };

    void loadFavorites();

    return () => {
      mounted = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!iframeSrc || preferredTransportMode === 'desktop-native') {
      setIsPreviewLoading(false);
      return;
    }

    setIsPreviewLoading(true);
  }, [iframeSrc, iframeKey, preferredTransportMode]);

  useEffect(() => {
    if (!favoritePopoverOpen) return;
    setFavoriteNameDraft(activeFavorite?.name ?? deriveFavoriteName(currentPageTitle, normalizedActiveUrl));
  }, [activeFavorite, currentPageTitle, favoritePopoverOpen, normalizedActiveUrl]);

  useEffect(() => {
    if (!favoritesListOpen) {
      setFavoriteSearch("");
      setRenamingUrl(null);
      setRenameDraft("");
    }
  }, [favoritesListOpen]);

  useEffect(() => {
    if (!extensionPopoverOpen) {
      setExtensionDownloadStarted(false);
      setIsDownloadingExtension(false);
      setIsRecheckingExtension(false);
    }
  }, [extensionPopoverOpen]);

  useEffect(() => {
    if (transportState.mode !== 'extension' || transportState.connected) {
      setExtensionDownloadStarted(false);
      setIsDownloadingExtension(false);
      setIsRecheckingExtension(false);
      setExtensionPopoverOpen(false);
    }
  }, [transportState.connected, transportState.mode]);

  const dismissSelectionPopover = useCallback((resetPreviewSelection: boolean = true) => {
    setSelectionPopoverVisible(false);
    setSelectionPopoverExpanded(false);
    setSelectionInfo(null);
    if (resetPreviewSelection) {
      void Promise.resolve(transportControllerRef.current?.clearSelection(false));
      if (isElementPickerEnabledRef.current) {
        void Promise.resolve(transportControllerRef.current?.enterPickMode());
      }
    }
  }, []);

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

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlistenResize: (() => void) | undefined;

    const syncFullscreen = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const fullscreen = await getCurrentWindow().isFullscreen();
      if (!disposed) {
        setIsDesktopWindowFullscreen(fullscreen);
      }
    };

    void syncFullscreen();

    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const currentWindow = getCurrentWindow();
      const unlisten = await currentWindow.onResized(() => {
        void syncFullscreen();
      });

      if (disposed) {
        unlisten();
        return;
      }

      unlistenResize = unlisten;
    });

    return () => {
      disposed = true;
      unlistenResize?.();
    };
  }, []);

  const needsDesktopPreviewSafeInset =
    isMaximized && isMacDesktop && !isDesktopWindowFullscreen;

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMaximized) {
        setIsMaximized(false);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isMaximized, setIsMaximized]);

  const handleRefresh = () => {
    if (!url) return;
    navigateToUrl(url);
  };

  const handleGoHome = useCallback(() => {
    setUrl("");
    setActiveUrl("");
    setCurrentPageTitle("");
    setIsElementPickerEnabled(false);
    teardownTransport();
  }, [setActiveUrl, setCurrentPageTitle, setIsElementPickerEnabled, setUrl, teardownTransport]);

  const handleGoBack = () => {
    if (!canGoBack) return;

    const newIndex = historyIndex - 1;
    const previousUrl = history[newIndex];
    if (!previousUrl) return;
    setCurrentPageTitle("");
    skipExternalHistorySyncRef.current = true;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    setUrl(previousUrl);
    setActiveUrl(previousUrl);
    setIframeSrc(previousUrl);
    setIframeKey((prev) => prev + 1);
  };

  const handleGoForward = () => {
    if (!canGoForward) return;

    const newIndex = historyIndex + 1;
    const nextUrl = history[newIndex];
    if (!nextUrl) return;
    setCurrentPageTitle("");
    skipExternalHistorySyncRef.current = true;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    setUrl(nextUrl);
    setActiveUrl(nextUrl);
    setIframeSrc(nextUrl);
    setIframeKey((prev) => prev + 1);
  };

  const handleAddFavorite = async () => {
    if (!normalizedActiveUrl) return;

    const trimmedName = favoriteNameDraft.trim();
    const nextFavorite: FavoriteSite = {
      url: normalizedActiveUrl,
      name: trimmedName || undefined,
    };

    const nextFavorites = activeFavorite
      ? favorites.map((site) =>
          canonicalizeUrl(site.url) === normalizedActiveUrl ? nextFavorite : site,
        )
      : [nextFavorite, ...favorites.filter((site) => canonicalizeUrl(site.url) !== normalizedActiveUrl)];

    const ok = await persistFavorites(nextFavorites);
    if (!ok) return;

    setFavoritePopoverOpen(false);
    toastManager.add({
      type: "success",
      title: activeFavorite ? "Favorite updated" : "Favorite saved",
      description: trimmedName || nextFavorite.url,
    });
  };

  const handleRenameFavorite = async (site: FavoriteSite) => {
    const nextName = renameDraft.trim();
    const nextFavorites = favorites.map((item) =>
      canonicalizeUrl(item.url) === canonicalizeUrl(site.url)
        ? { ...item, name: nextName || undefined }
        : item,
    );

    const ok = await persistFavorites(nextFavorites);
    if (!ok) return;

    setRenamingUrl(null);
    setRenameDraft("");
  };

  const handleDeleteFavorite = async (site: FavoriteSite) => {
    const nextFavorites = favorites.filter(
      (item) => canonicalizeUrl(item.url) !== canonicalizeUrl(site.url),
    );
    await persistFavorites(nextFavorites);
  };

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

  const getPopoverPositionFromRect = useCallback((rect: { x: number; y: number; width: number; height: number }) => {
    const targetBounds =
      transportControllerRef.current?.mode === 'desktop-native'
        ? desktopViewportRef.current?.getBoundingClientRect()
        : iframeRef.current?.getBoundingClientRect();

    if (!targetBounds) {
      return { x: rect.x, y: rect.y + rect.height + 8 };
    }

    const estimatedPopoverWidth = 112;
    const estimatedPopoverHeight = 36;
    const rawX = targetBounds.left + rect.x + Math.min(rect.width, 220) / 2 - estimatedPopoverWidth / 2;
    const belowY = targetBounds.top + rect.y + rect.height + 12;
    const aboveY = targetBounds.top + rect.y - estimatedPopoverHeight - 12;
    const rawY =
      belowY + estimatedPopoverHeight <= window.innerHeight - 8
        ? belowY
        : Math.max(8, aboveY);

    return {
      x: Math.max(8, Math.min(rawX, Math.max(8, window.innerWidth - estimatedPopoverWidth - 8))),
      y: Math.max(8, rawY),
    };
  }, []);

  const handleSelectedPayload = useCallback((mode: PreviewTransportMode, payload: PreviewHelperPayload) => {
    const nextSelectionInfo: SelectionInfo = {
      filePath: payload.pageUrl,
      startLine: 0,
      endLine: 0,
      selectedText: payload.elementContext.selectedText,
      language: "html",
      sourceType: "element",
      pageUrl: payload.pageUrl,
      selector: payload.elementContext.selector,
      tagName: payload.elementContext.tagName,
      attributesSummary: payload.elementContext.attributesSummary,
      textPreview: payload.elementContext.textPreview,
      htmlPreview: payload.elementContext.htmlPreview,
      framework: payload.sourceLocation?.framework,
      componentName: payload.sourceLocation?.componentName,
      componentFilePath: payload.sourceLocation?.filePath,
      componentLine: payload.sourceLocation?.line,
      componentColumn: payload.sourceLocation?.column,
      componentChain: payload.sourceLocation?.componentChain,
      sourceConfidence: payload.sourceLocation?.confidence,
      sourceDebugSignals: payload.sourceLocation?.debug,
      transportMode: mode,
    };

    setSelectionInfo(nextSelectionInfo);
    if (mode === 'desktop-native') {
      setSelectionPopoverVisible(false);
    } else {
      setSelectionPopoverPosition(getPopoverPositionFromRect(payload.rect));
      setSelectionPopoverVisible(true);
    }
    setSelectionPopoverExpanded(false);
  }, [getPopoverPositionFromRect]);

  const handleDesktopToolbarCopy = useCallback(async () => {
    if (!selectionInfo || selectionInfo.transportMode !== 'desktop-native') return;

    try {
      await navigator.clipboard.writeText(formatPreviewSelectionForAI(selectionInfo));
      toastManager.add({
        title: 'Copied',
        description: 'Selection copied for AI',
        type: 'success',
      });
      dismissSelectionPopover();
    } catch {
      toastManager.add({
        title: 'Failed to copy',
        description: 'Could not copy to clipboard',
        type: 'error',
      });
    }
  }, [dismissSelectionPopover, selectionInfo]);

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
      extraHandlers?.onReady?.(capabilities, extensionVersion, pageTitle);
    },
    onSelected: (payload: PreviewHelperPayload) => {
      handleSelectedPayload(mode, payload);
      extraHandlers?.onSelected?.(payload);
    },
    onToolbarAction: (action: 'copy') => {
      if (mode === 'desktop-native' && action === 'copy') {
        void handleDesktopToolbarCopy();
      }
      extraHandlers?.onToolbarAction?.(action);
    },
    onCleared: () => {
      dismissSelectionPopover(false);
      extraHandlers?.onCleared?.();
    },
    onError: (message: string) => {
      if (mode === 'extension') {
        extensionConnectingRef.current = false;
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
        desktopPreviewUrlRef.current = canonicalizeUrl(nextUrl);
      }
      setUrl(nextUrl);
      setActiveUrl(nextUrl);
      if (pageTitle !== undefined) {
        setCurrentPageTitle(pageTitle);
      }
      pushHistoryEntry(nextUrl);
      extraHandlers?.onNavigationChanged?.(nextUrl, pageTitle);
    },
    onTitleChanged: (pageTitle: string) => {
      setCurrentPageTitle(pageTitle);
      extraHandlers?.onTitleChanged?.(pageTitle);
    },
  }), [dismissSelectionPopover, handleDesktopToolbarCopy, handleSelectedPayload, pushHistoryEntry, setActiveUrl, setUrl]);

  const connectIframeTransport = useCallback(async (options?: {
    enterPickMode?: boolean;
    awaitHandshake?: boolean;
  }) => {
    if (!normalizedActiveUrl) return false;

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
      pageUrl: normalizedActiveUrl,
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
  }, [createPreviewSessionId, createTransportHandlers, normalizedActiveUrl, preferredTransportMode, syncSameOriginPreviewAccess, teardownTransport]);

  const syncDesktopPreview = useCallback(async () => {
    if (preferredTransportMode !== 'desktop-native' || !normalizedActiveUrl || !desktopViewportRef.current) {
      if (transportControllerRef.current?.mode === 'desktop-native') {
        teardownTransport(false);
      }
      return;
    }

    const viewport = await getPreviewViewportBounds(desktopViewportRef.current);
    const viewportKey = JSON.stringify(viewport);
    if (transportControllerRef.current?.mode === 'desktop-native' && transportSessionIdRef.current) {
      if (desktopPreviewUrlRef.current !== normalizedActiveUrl) {
        await transportControllerRef.current.navigate?.(normalizedActiveUrl);
        desktopPreviewUrlRef.current = normalizedActiveUrl;
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
        pageUrl: normalizedActiveUrl,
        viewport,
        ...createTransportHandlers('desktop-native'),
      });
      desktopPreviewUrlRef.current = normalizedActiveUrl;
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
  }, [createPreviewSessionId, createTransportHandlers, normalizedActiveUrl, preferredTransportMode, teardownTransport]);

  const showDesktopPreview = useCallback(async () => {
    if (preferredTransportMode !== 'desktop-native' || !normalizedActiveUrl || !desktopViewportRef.current) return;
    if (transportControllerRef.current?.mode !== 'desktop-native') {
      await syncDesktopPreview();
      return;
    }
    await transportControllerRef.current.show?.();
    await transportControllerRef.current.updateViewport?.(await getPreviewViewportBounds(desktopViewportRef.current));
  }, [normalizedActiveUrl, preferredTransportMode, syncDesktopPreview]);

  const hideDesktopPreview = useCallback(async () => {
    if (transportControllerRef.current?.mode !== 'desktop-native') return;
    await transportControllerRef.current.hide?.();
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIsPreviewLoading(false);

    iframeUrlWatcherCleanupRef.current?.();
    iframeUrlWatcherCleanupRef.current = null;

    if (preferredTransportMode === 'same-origin') {
      syncSameOriginPreviewAccess();
      try {
        const iframeWin = iframeRef.current?.contentWindow;
        if (iframeWin) {
          const iframeUrl = iframeWin.location.href;
          const iframeTitle = iframeWin.document.title?.trim() ?? "";
          setCurrentPageTitle(iframeTitle);
          if (canonicalizeUrl(iframeUrl) !== normalizedActiveUrl) {
            setUrl(iframeUrl);
            setActiveUrl(iframeUrl);
            pushHistoryEntry(iframeUrl);
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
      if (isActive && preferredTransportMode === 'extension') {
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
    isActive,
    isElementPickerEnabled,
    normalizedActiveUrl,
    preferredTransportMode,
    pushHistoryEntry,
    setActiveUrl,
    setUrl,
    syncSameOriginPreviewAccess,
  ]);

  useEffect(() => {
    if (!iframeSrc) {
      setTransportState({
        mode: 'unavailable',
        connected: false,
        message: '',
        capabilities: [],
      });
      teardownTransport();
      return;
    }

    if (preferredTransportMode === 'desktop-native') {
      setTransportState((previous) => ({
        ...previous,
        mode: 'desktop-native',
        message: previous.message,
      }));
      if (isActive) {
        void syncDesktopPreview();
      } else {
        void hideDesktopPreview();
      }
      return;
    }

    if (transportControllerRef.current?.mode === 'desktop-native') {
      teardownTransport(false);
    }

    setTransportState((previous) => ({
      mode: preferredTransportMode,
      connected:
        preferredTransportMode === 'extension' && previous.mode === 'extension'
          ? previous.connected
          : false,
      message:
        preferredTransportMode === 'extension'
          ? previous.mode === 'extension' && previous.connected
            ? ''
            : PREVIEW_EXTENSION_REQUIRED_MESSAGE
          : preferredTransportMode === 'same-origin'
            ? ''
            : PREVIEW_SELECTION_UNAVAILABLE_MESSAGE,
      capabilities:
        preferredTransportMode === 'extension' && previous.mode === 'extension'
          ? previous.capabilities
          : [],
    }));
  }, [hideDesktopPreview, iframeSrc, iframeKey, isActive, preferredTransportMode, syncDesktopPreview, teardownTransport]);

  useEffect(() => {
    if (!isActive || !iframeSrc || preferredTransportMode !== 'extension') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (
        transportControllerRef.current?.mode === 'extension' &&
        (transportState.connected || extensionConnectingRef.current)
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
    iframeSrc,
    iframeKey,
    isActive,
    isElementPickerEnabled,
    preferredTransportMode,
    transportState.connected,
  ]);

  useEffect(() => {
    if (transportControllerRef.current?.mode === 'desktop-native') return;
    teardownTransport(false);
    if (preferredTransportMode !== 'extension') {
      setIsElementPickerEnabled(false);
    }
  }, [iframeSrc, iframeKey, preferredTransportMode, setIsElementPickerEnabled, teardownTransport]);

  useEffect(() => {
    if (preferredTransportMode !== 'desktop-native') return;

    const surface = desktopViewportRef.current;
    if (!surface) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    const syncBounds = async () => {
      if (disposed || transportControllerRef.current?.mode !== 'desktop-native' || !desktopViewportRef.current) return;
      await transportControllerRef.current.updateViewport?.(await getPreviewViewportBounds(desktopViewportRef.current));
    };

    resizeObserver = new ResizeObserver(() => {
      void syncBounds();
    });
    resizeObserver.observe(surface);
    window.addEventListener('resize', syncBounds);

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
      window.removeEventListener('resize', syncBounds);
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, [preferredTransportMode]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (preferredTransportMode !== 'desktop-native' || !isActive || !normalizedActiveUrl) {
      void hideDesktopPreview();
      return;
    }
    void showDesktopPreview();
  }, [hideDesktopPreview, isActive, normalizedActiveUrl, preferredTransportMode, showDesktopPreview]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (preferredTransportMode !== 'desktop-native' || !isActive || !normalizedActiveUrl) return;

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
  }, [isActive, isMaximized, normalizedActiveUrl, preferredTransportMode, showDesktopPreview]);

  useEffect(() => {
    const toolbarRow = toolbarRowRef.current;
    if (!toolbarRow) return;

    const syncToolbarWidth = () => {
      setToolbarWidth(toolbarRow.getBoundingClientRect().width);
    };

    syncToolbarWidth();

    const observer = new ResizeObserver(() => {
      syncToolbarWidth();
    });
    observer.observe(toolbarRow);
    window.addEventListener('resize', syncToolbarWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncToolbarWidth);
    };
  }, []);

  useLayoutEffect(() => {
    const toolbarRow = toolbarRowRef.current;
    if (!toolbarRow) return;

    setToolbarWidth(toolbarRow.getBoundingClientRect().width);
  }, [isMaximized]);

  useEffect(() => () => {
    teardownTransport(false);
    iframeUrlWatcherCleanupRef.current?.();
    iframeUrlWatcherCleanupRef.current = null;
  }, [teardownTransport]);

  const checkExtensionUpdate = useCallback(async () => {
    if (preferredTransportMode !== 'extension') return;
    const installedVersion = extensionVersionRef.current;
    if (!installedVersion) return;

    try {
      const lastCheck = Number(localStorage.getItem('atmos-ext-version-check-ts') || '0');
      if (Date.now() - lastCheck < 86_400_000) return;

      localStorage.setItem('atmos-ext-version-check-ts', String(Date.now()));
      const latestVersion = await fetchExtensionVersion();
      setExtensionUpdateAvailable(latestVersion !== installedVersion);
    } catch {
      // Silently ignore version check failures
    }
  }, [preferredTransportMode]);

  const handleDownloadExtensionUpdate = useCallback(async () => {
    if (typeof window === 'undefined' || isDownloadingExtension) return;
    setIsDownloadingExtension(true);
    try {
      const blob = await fetchExtensionDownload();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'atmos-inspector-extension.zip';
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1_000);

      setExtensionUpdateAvailable(false);
      setExtensionUpdatePopoverOpen(false);
      toastManager.add({
        type: 'success',
        title: 'Extension update downloaded',
        description: 'Replace the old extension folder with the new one and reload.',
      });
    } catch (error) {
      toastManager.add({
        type: 'error',
        title: 'Failed to download extension',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsDownloadingExtension(false);
    }
  }, [isDownloadingExtension]);

  const handleToggleElementPicker = useCallback(async () => {
    if (!normalizedActiveUrl) return;

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
  }, [checkExtensionUpdate, connectIframeTransport, dismissSelectionPopover, isElementPickerEnabled, normalizedActiveUrl, preferredTransportMode, setIsElementPickerEnabled, syncDesktopPreview, transportState.connected]);

  const resolvedTransportMode =
    transportState.mode === 'unavailable' && normalizedActiveUrl
      ? preferredTransportMode
      : transportState.mode;
  const canAutoHideToolbar = resolvedTransportMode !== 'desktop-native';
  const effectiveIsToolbarHidden = canAutoHideToolbar && isToolbarHidden;
  const transportModeLabel = resolvedTransportMode === 'desktop-native'
    ? 'Desktop'
    : resolvedTransportMode === 'extension'
      ? transportState.connected ? 'Extension' : 'Extension required'
      : resolvedTransportMode === 'same-origin'
        ? 'Same-origin'
        : 'Unavailable';
  const shouldShowExtensionInstall = resolvedTransportMode === 'extension' && !transportState.connected;

  useEffect(() => {
    if (!canAutoHideToolbar && isToolbarHidden) {
      setIsToolbarHidden(false);
    }
  }, [canAutoHideToolbar, isToolbarHidden, setIsToolbarHidden]);

  const handleDownloadExtension = useCallback(async () => {
    if (typeof window === "undefined" || isDownloadingExtension) return;

    setIsDownloadingExtension(true);

    try {
      const blob = await fetchExtensionDownload();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'atmos-inspector-extension.zip';
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1_000);

      setExtensionDownloadStarted(true);
      toastManager.add({
        type: 'success',
        title: 'Extension package downloaded',
        description: 'Unzip atmos-inspector-extension.zip, then load the extracted folder in Chrome or Edge.',
      });
    } catch (error) {
      toastManager.add({
        type: 'error',
        title: 'Failed to download extension',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsDownloadingExtension(false);
    }
  }, [isDownloadingExtension]);

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
  }, [connectIframeTransport, isRecheckingExtension, preferredTransportMode]);

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
  const shouldHideToolbarStatus = toolbarWidth > 0 && toolbarWidth < 1024;
  const shouldHideToolbarViewControls = toolbarWidth > 0 && toolbarWidth < 900;
  const shouldHideToolbarNavigation = toolbarWidth > 0 && toolbarWidth < 700;
  const shouldHideToolbarExternalActions = toolbarWidth > 0 && toolbarWidth < 620;
  const shouldHideToolbarUtilityActions = toolbarWidth > 0 && toolbarWidth < 540;
  const shouldUseCompactToolbar = toolbarWidth > 0 && toolbarWidth < 760;
  const shouldStackPreviewHomeCards = toolbarWidth > 0 && toolbarWidth < 900;
  const shouldStackPreviewHomeNotes = toolbarWidth > 0 && toolbarWidth < 760;

  const previewContent = (
    <div
      ref={previewRootRef}
      className={cn(
        "flex flex-col overflow-hidden bg-background transition-all duration-300 ease-in-out",
        isMaximized
          ? "fixed inset-0 z-50 h-screen w-screen animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
          : "h-full w-full",
      )}
    >
      <div
        className={cn(
          "shrink-0",
          needsDesktopPreviewSafeInset && "pt-8",
          effectiveIsToolbarHidden && "group/toolbar relative z-10 h-1.5 overflow-visible",
          toolbarHoverSuppressed && "pointer-events-none",
        )}
      >
        <div
          ref={toolbarRowRef}
          className={cn(
            "flex h-10 items-center gap-2 overflow-hidden bg-muted/10 px-2 transition-all duration-300 ease-in-out",
            effectiveIsToolbarHidden &&
              "absolute inset-x-0 top-0 z-20 -translate-y-full rounded-b-md border-b border-border/60 bg-background/92 shadow-lg backdrop-blur-md opacity-0 group-hover/toolbar:translate-y-0 group-hover/toolbar:opacity-100",
            effectiveIsToolbarHidden && needsDesktopPreviewSafeInset && "top-8",
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center gap-1",
              (shouldHideToolbarViewControls || shouldUseCompactToolbar) && "hidden",
            )}
          >
            <div className="flex items-center rounded-md border border-border p-0.5">
              <button
                onClick={() => setViewMode("desktop")}
                className={cn(
                  "rounded-sm p-1.5 transition-colors",
                  viewMode === "desktop"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Desktop View"
              >
                <Monitor className="size-3.5" />
              </button>
              <button
                onClick={() => setViewMode("mobile")}
                className={cn(
                  "rounded-sm p-1.5 transition-colors",
                  viewMode === "mobile"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Mobile View"
              >
                <Smartphone className="size-3.5" />
              </button>
            </div>

            <Popover open={favoritesListOpen} onOpenChange={setFavoritesListOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Favorites"
                >
                  <FolderHeart className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={8}
                className="w-[340px] p-2"
                onOpenAutoFocus={(event) => event.preventDefault()}
                onPointerDownOutside={() => setFavoritesListOpen(false)}
                onEscapeKeyDown={() => setFavoritesListOpen(false)}
              >
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={favoriteSearch}
                      onChange={(event) => setFavoriteSearch(event.target.value)}
                      placeholder="Search favorites"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>

                  <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
                    {filteredFavorites.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                        {favorites.length === 0 ? "No favorites yet" : "No matching favorites"}
                      </div>
                    ) : (
                      filteredFavorites.map((site) => {
                        const isRenaming = renamingUrl === site.url;
                        return (
                          <div
                            key={site.url}
                            className="group/item rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/40"
                          >
                            {isRenaming ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  autoFocus
                                  value={renameDraft}
                                  onChange={(event) => setRenameDraft(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void handleRenameFavorite(site);
                                    }
                                    if (event.key === "Escape") {
                                      setRenamingUrl(null);
                                      setRenameDraft("");
                                    }
                                  }}
                                  placeholder="Favorite name"
                                  className="h-8 text-xs"
                                />
                                <button
                                  onClick={() => void handleRenameFavorite(site)}
                                  className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  title="Save"
                                >
                                  <Check className="size-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setRenamingUrl(null);
                                    setRenameDraft("");
                                  }}
                                  className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  title="Cancel"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    navigateToUrl(site.url);
                                    setFavoritesListOpen(false);
                                  }}
                                  type="button"
                                  className="min-w-0 flex-1 text-left"
                                  title={site.name || site.url}
                                >
                                  <div className="truncate text-xs font-medium text-foreground">
                                    {site.name?.trim() || site.url}
                                  </div>
                                  {site.name?.trim() ? (
                                    <div className="truncate text-[11px] text-muted-foreground">
                                      {site.url}
                                    </div>
                                  ) : null}
                                </button>
                                <button
                                  onClick={() => {
                                    setRenamingUrl(site.url);
                                    setRenameDraft(site.name ?? "");
                                  }}
                                  type="button"
                                  className="rounded-sm p-1 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover/item:opacity-100"
                                  title="Rename"
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                                <button
                                  onClick={() => void handleDeleteFavorite(site)}
                                  type="button"
                                  className="rounded-sm p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover/item:opacity-100"
                                  title="Delete"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div
            className={cn(
              "flex shrink-0 items-center gap-0.5",
              (shouldHideToolbarNavigation || shouldUseCompactToolbar) && "hidden",
            )}
          >
            <button
              onClick={handleGoBack}
              disabled={!canGoBack}
              className={cn(
                "rounded-sm p-1.5 transition-colors",
                canGoBack
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/30",
              )}
              title="Back"
            >
              <ArrowLeft className="size-3.5" />
            </button>
            <button
              onClick={handleGoForward}
              disabled={!canGoForward}
              className={cn(
                "rounded-sm p-1.5 transition-colors",
                canGoForward
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/30",
              )}
              title="Forward"
            >
              <ArrowRight className="size-3.5" />
            </button>
            <button
              onClick={handleRefresh}
              className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Refresh"
            >
              <RotateCw className="size-3.5" />
            </button>
          </div>

          <div className="mx-0.5 flex h-7 min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md border border-border px-1.5">
            <button
              type="button"
              onClick={handleGoHome}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Back to Preview home"
            >
              <Home className="size-3.5" />
            </button>
            {isUrlInputFocused ? (
              <input
                ref={urlInputRef}
                className="h-full min-w-0 flex-1 border-none bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground/50"
                value={url ?? ""}
                onBlur={() => setIsUrlInputFocused(false)}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleRefresh();
                  }
                }}
                placeholder="Enter URL..."
              />
            ) : (
              <button
                type="button"
                onClick={focusUrlInput}
                className="flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-sm px-0.5 text-left"
                title={url || "Enter URL..."}
              >
                {displayUrlParts.address ? (
                  <>
                    {displayUrlParts.protocol ? (
                      <span className="shrink-0 text-xs text-muted-foreground/70">
                        {displayUrlParts.protocol}
                      </span>
                    ) : null}
                    <span className="truncate text-xs text-foreground">
                      {displayUrlParts.address}
                    </span>
                    {displayPageTitle ? (
                      <span className="truncate text-xs text-muted-foreground">
                        / {displayPageTitle}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground/50">Enter URL...</span>
                )}
              </button>
            )}

            <Popover open={favoritePopoverOpen} onOpenChange={setFavoritePopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "shrink-0 rounded-sm p-0.5 transition-colors",
                    normalizedActiveUrl
                      ? activeFavorite
                        ? "text-favorite hover:opacity-80"
                        : "text-muted-foreground hover:text-foreground"
                      : "pointer-events-none text-muted-foreground/30",
                  )}
                  title={activeFavorite ? "Edit favorite" : "Add favorite"}
                >
                  <Star className={cn("size-3.5", activeFavorite && "fill-current")} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-[320px] p-4"
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {activeFavorite ? "Edit favorite" : "Save favorite"}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {normalizedActiveUrl || "No page selected"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Name</label>
                    <Input
                      value={favoriteNameDraft}
                      onChange={(event) => setFavoriteNameDraft(event.target.value)}
                      placeholder="Favorite name"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFavoritePopoverOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!normalizedActiveUrl || savingFavorite}
                      onClick={() => void handleAddFavorite()}
                    >
                      {activeFavorite ? "Update" : "Save"}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {shouldHideToolbarExternalActions || shouldUseCompactToolbar ? null : (
            <button
              onClick={() => {
                if (!normalizedActiveUrl) return;
                window.open(normalizedActiveUrl, "_blank", "noopener,noreferrer");
              }}
              className={cn(
                "shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                !normalizedActiveUrl && "pointer-events-none opacity-50",
              )}
              title="Open in browser"
            >
              <ExternalLink className="size-3.5" />
            </button>
          )}

          {activeUrl && !shouldUseCompactToolbar ? (
            <div
              className={cn(
                "hidden shrink-0 items-center overflow-hidden rounded-md border border-border/60 bg-background/60 md:flex",
                shouldHideToolbarStatus && "md:hidden",
              )}
            >
              <TooltipProvider delayDuration={150}>
                <Tooltip
                  open={isElementPickerTooltipOpen}
                  onOpenChange={setIsElementPickerTooltipOpen}
                  disableHoverableContent
                >
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <button
                        onClick={handleToggleElementPicker}
                        disabled={!activeUrl || preferredTransportMode === 'unavailable'}
                        className={cn(
                          "flex h-6 cursor-pointer items-center justify-center px-2 leading-none transition-colors",
                          activeUrl && preferredTransportMode !== 'unavailable'
                            ? isElementPickerEnabled
                              ? "text-blue-400 hover:bg-blue-400/10 hover:text-blue-300"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            : "cursor-not-allowed text-muted-foreground/30",
                        )}
                        aria-label={elementPickerTitle}
                      >
                        <SquareMousePointer className="size-3.5" />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
                    {elementPickerTooltip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {extensionUpdateAvailable ? (
                <Popover open={extensionUpdatePopoverOpen} onOpenChange={setExtensionUpdatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-6 cursor-pointer items-center px-1.5 text-[11px] leading-none font-medium text-emerald-400 transition-colors hover:text-emerald-300"
                    >
                      Update
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="w-[320px] space-y-3 p-3"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                  >
                    <p className="text-xs font-medium text-foreground">Extension update available</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      A newer version of the Atmos Inspector extension is available. Download and replace the old files to get the latest features and fixes.
                    </p>
                    <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                      <li>Download the new extension package below.</li>
                      <li>Unzip and <span className="font-medium text-foreground">replace</span> the old <span className="font-medium text-foreground">atmos-inspector-extension</span> folder.</li>
                      <li>Open <span className="font-medium text-foreground">chrome://extensions</span> and click the <span className="font-medium text-foreground">reload ↻</span> button on the extension card.</li>
                      <li>Reload the target page in Atmos Preview.</li>
                    </ol>
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExtensionUpdatePopoverOpen(false)}
                      >
                        Later
                      </Button>
                      <Button
                        size="sm"
                        disabled={isDownloadingExtension}
                        onClick={() => {
                          void handleDownloadExtensionUpdate();
                        }}
                      >
                        {isDownloadingExtension ? 'Preparing…' : 'Download update'}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}

              <div className="h-5 w-px bg-border/60" />

              {shouldShowExtensionInstall ? (
                <Popover open={extensionPopoverOpen} onOpenChange={setExtensionPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-6 cursor-pointer items-center px-2 text-[11px] leading-none font-medium text-foreground transition-colors hover:bg-accent/50"
                    >
                      {transportModeLabel}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="w-[320px] space-y-3 p-3"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onPointerDownOutside={(event) => event.preventDefault()}
                    onInteractOutside={(event) => event.preventDefault()}
                    onEscapeKeyDown={(event) => event.preventDefault()}
                  >
                    {extensionDownloadStarted ? (
                      <div className="space-y-3">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          The extension package has been downloaded. Pages that reject iframe embedding still need the desktop preview.
                        </p>
                        <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                          <li>Unzip <span className="font-medium text-foreground">atmos-inspector-extension.zip</span>.</li>
                          <li>Open <span className="font-medium text-foreground">chrome://extensions</span> or <span className="font-medium text-foreground">edge://extensions</span>.</li>
                          <li>Turn on <span className="font-medium text-foreground">Developer mode</span>.</li>
                          <li>Click <span className="font-medium text-foreground">Load unpacked</span>.</li>
                          <li>Select the extracted <span className="font-medium text-foreground">atmos-inspector-extension</span> folder.</li>
                          <li>Return to Atmos and reload the target page, then start element selection again.</li>
                        </ol>
                        <div className="flex items-center justify-between gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExtensionPopoverOpen(false)}
                          >
                            Close
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isRecheckingExtension}
                            onClick={() => {
                              void handleRecheckExtension();
                            }}
                          >
                            {isRecheckingExtension ? 'Rechecking…' : 'Recheck'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Cross-port element selection requires the Atmos Inspector extension. Pages that reject iframe embedding must use the desktop preview.
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExtensionPopoverOpen(false)}
                          >
                            Close
                          </Button>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isRecheckingExtension}
                              onClick={() => {
                                void handleRecheckExtension();
                              }}
                            >
                              {isRecheckingExtension ? 'Rechecking…' : 'Recheck'}
                            </Button>
                            <Button
                              size="sm"
                              disabled={isDownloadingExtension}
                              onClick={() => {
                                void handleDownloadExtension();
                              }}
                            >
                              {isDownloadingExtension ? 'Preparing…' : 'Install'}
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              ) : (
                <div className="flex h-6 items-center px-2 text-[11px] leading-none font-medium text-muted-foreground">
                  {transportModeLabel}
                </div>
              )}
            </div>
          ) : null}

          {shouldHideToolbarUtilityActions || shouldUseCompactToolbar || !canAutoHideToolbar ? null : (
            <button
              onClick={() => setIsToolbarHidden(!effectiveIsToolbarHidden)}
              className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={effectiveIsToolbarHidden ? "Show Toolbar" : "Auto-hide Toolbar"}
            >
              {effectiveIsToolbarHidden ? (
                <PanelTopOpen className="size-3.5" />
              ) : (
                <PanelTopClose className="size-3.5" />
              )}
            </button>
          )}

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={isMaximized ? "Minimize" : "Maximize"}
          >
            {isMaximized ? (
              <Minimize className="size-3.5" />
            ) : (
              <Maximize className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 justify-center overflow-hidden"
        onPointerEnter={() => {
          setIsElementPickerTooltipOpen(false);
        }}
        onMouseEnter={() => {
          setIsElementPickerTooltipOpen(false);
        }}
      >
        {resolvedTransportMode !== 'desktop-native' ? (
          <SelectionPopover
            isVisible={selectionPopoverVisible}
            position={selectionPopoverPosition}
            selectionInfo={selectionInfo}
            isExpanded={selectionPopoverExpanded}
            onExpand={() => setSelectionPopoverExpanded(true)}
            onDismiss={dismissSelectionPopover}
            type="preview"
            popoverRef={selectionPopoverRef}
            positioning="fixed"
          />
        ) : null}
        {favoritesListOpen ? (
          <button
            type="button"
            aria-label="Close favorites"
            className="absolute inset-0 z-10 cursor-default bg-transparent"
            onClick={() => setFavoritesListOpen(false)}
          />
        ) : null}
        {activeUrl ? (
          preferredTransportMode === 'desktop-native' ? (
            <div
              ref={desktopViewportRef}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-3 border border-dashed border-border/60 bg-muted/10 px-6 text-center",
                viewMode === "mobile" ? "w-[375px]" : "w-full",
              )}
            >
              <div className="text-sm font-medium text-foreground">Desktop native preview active</div>
              <div className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                The page is rendered in a Tauri-managed preview window so cross-port and iframe-blocked pages can still use element selection and source-component detection.
              </div>
              {transportState.message ? (
                <div className="max-w-xl text-[11px] leading-relaxed text-muted-foreground">
                  {transportState.message}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={iframeSrc}
                onLoad={handleIframeLoad}
                style={{ colorScheme: "dark" }}
                className={cn(
                  "block h-full border-0 bg-white outline-none transition-all duration-300",
                  viewMode === "mobile" ? "w-[375px] border-x border-border shadow-sm" : "w-full",
                )}
                title="Preview"
              />
              {isPreviewLoading ? (
                <div
                  className={cn(
                    "absolute inset-0 z-20 flex items-center justify-center bg-background",
                    viewMode === "mobile" && "mx-auto w-[375px]",
                  )}
                >
                  <div className="flex h-full w-full flex-col justify-center px-4 py-6 sm:px-6 sm:py-8">
                    <div className="mx-auto w-full max-w-4xl">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-muted" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="h-3 w-28 rounded bg-muted" />
                          <div className="h-2.5 w-40 max-w-full rounded bg-muted/80 sm:w-56" />
                        </div>
                      </div>
                      <div className="mt-6 space-y-4">
                        <div className="h-[28vh] min-h-32 rounded-2xl bg-muted/50" />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="h-16 rounded-xl bg-muted/60" />
                          <div className="h-16 rounded-xl bg-muted/40" />
                        </div>
                      </div>
                      <div className="mt-4">
                        <TextShimmer
                          as="p"
                          duration={1.8}
                          className="text-sm font-medium sm:text-base"
                        >
                          Loading preview...
                        </TextShimmer>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )
        ) : (
          <div className="flex h-full w-full items-start justify-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-10">
            <div className="w-full max-w-4xl">
              <div className="space-y-3">
                <div
                  className={cn(
                    "font-semibold tracking-tight text-foreground",
                    shouldStackPreviewHomeCards ? "text-2xl" : "text-3xl sm:text-4xl",
                  )}
                >
                  Preview
                </div>
                <p
                  className={cn(
                    "max-w-2xl leading-relaxed text-muted-foreground",
                    shouldStackPreviewHomeCards ? "text-sm" : "text-base sm:text-lg",
                  )}
                >
                  Open a local app or website, inspect elements, and send clean page context to AI.
                </p>
              </div>

              <div
                className={cn(
                  "mt-8 grid gap-4 md:mt-10",
                  shouldStackPreviewHomeCards ? "grid-cols-1" : "grid-cols-3",
                )}
              >
                <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
                  <Monitor className="size-5 text-foreground" />
                  <div className="mt-4 text-base font-medium text-foreground">Preview pages</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Load localhost apps, internal tools, or any URL you want to inspect.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
                  <SquareMousePointer className="size-5 text-foreground" />
                  <div className="mt-4 text-base font-medium text-foreground">Select elements</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Click elements to capture DOM context and source-component hints.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
                  <ExternalLink className="size-5 text-foreground" />
                  <div className="mt-4 text-base font-medium text-foreground">Work across modes</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Same-origin works directly. Cross-port pages use the extension or desktop preview.
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "mt-6 grid gap-3 rounded-2xl border border-dashed border-border/70 bg-background/35 p-4 md:mt-8 md:p-5",
                  shouldStackPreviewHomeNotes ? "grid-cols-1" : "grid-cols-2",
                )}
              >
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Start
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Enter a URL above and press <span className="font-medium text-foreground">Enter</span>.
                  </p>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Cross-port
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    If a page is on another port, install the Atmos Inspector extension or use the desktop preview.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return previewContent;
};
