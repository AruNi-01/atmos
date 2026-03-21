"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Smartphone,
  Star,
  X,
} from "lucide-react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  toastManager,
} from "@workspace/ui";
import { functionSettingsApi } from "@/api/ws-api";

type ViewMode = "desktop" | "mobile";

interface FavoriteSite {
  url: string;
  name?: string;
}

interface PreviewProps {
  url: string;
  setUrl: (url: string) => void;
  activeUrl: string;
  setActiveUrl: (url: string) => void;
}

const MAX_HISTORY_LENGTH = 100;

const normalizeUrl = (value: string): string => {
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

const deriveFavoriteName = (title: string, url: string): string => {
  const trimmedTitle = title.trim();
  if (trimmedTitle) return trimmedTitle;

  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export const Preview: React.FC<PreviewProps> = ({
  url,
  setUrl,
  activeUrl,
  setActiveUrl,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");
  const [iframeKey, setIframeKey] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isToolbarHidden, setIsToolbarHidden] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [favorites, setFavorites] = useState<FavoriteSite[]>([]);
  const [favoritePopoverOpen, setFavoritePopoverOpen] = useState(false);
  const [favoritesListOpen, setFavoritesListOpen] = useState(false);
  const [favoriteNameDraft, setFavoriteNameDraft] = useState("");
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [currentPageTitle, setCurrentPageTitle] = useState("");
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [renamingUrl, setRenamingUrl] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const historyIndexRef = useRef(-1);
  const skipExternalHistorySyncRef = useRef(false);

  const normalizedActiveUrl = useMemo(() => canonicalizeUrl(activeUrl), [activeUrl]);
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

      skipExternalHistorySyncRef.current = true;
      setUrl(finalUrl);
      setActiveUrl(finalUrl);
      setIframeKey((prev) => prev + 1);

      if (!pushHistory) return;
      pushHistoryEntry(finalUrl);
    },
    [pushHistoryEntry, setActiveUrl, setUrl],
  );

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    if (!normalizedActiveUrl) return;

    if (skipExternalHistorySyncRef.current) {
      skipExternalHistorySyncRef.current = false;
      return;
    }

    const currentEntry =
      historyIndexRef.current >= 0
        ? canonicalizeUrl(history[historyIndexRef.current] ?? "")
        : "";

    if (currentEntry === normalizedActiveUrl) {
      return;
    }

    pushHistoryEntry(normalizedActiveUrl);
  }, [history, normalizedActiveUrl, pushHistoryEntry]);

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

  useEffect(() => {
    setCurrentPageTitle("");
  }, [normalizedActiveUrl]);

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
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMaximized) {
        setIsMaximized(false);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isMaximized]);

  const handleRefresh = () => {
    navigateToUrl(url);
  };

  const handleGoBack = () => {
    if (!canGoBack) return;

    const newIndex = historyIndex - 1;
    const previousUrl = history[newIndex];
    skipExternalHistorySyncRef.current = true;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    setUrl(previousUrl);
    setActiveUrl(previousUrl);
    setIframeKey((prev) => prev + 1);
  };

  const handleGoForward = () => {
    if (!canGoForward) return;

    const newIndex = historyIndex + 1;
    const nextUrl = history[newIndex];
    skipExternalHistorySyncRef.current = true;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    setUrl(nextUrl);
    setActiveUrl(nextUrl);
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

  const handleIframeLoad = () => {
    try {
      const title = iframeRef.current?.contentDocument?.title?.trim() ?? "";
      setCurrentPageTitle(title);
    } catch {
      setCurrentPageTitle("");
    }
  };

  return (
    <div
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
          isToolbarHidden && "group/toolbar pt-3 transition-all duration-300 hover:pt-0",
        )}
      >
        <div
          className={cn(
            "flex h-10 items-center gap-2 overflow-hidden bg-muted/10 px-2 transition-all duration-300 ease-in-out",
            isToolbarHidden &&
              "h-0 opacity-0 group-hover/toolbar:h-10 group-hover/toolbar:opacity-100",
          )}
        >
          <div className="flex shrink-0 items-center gap-1">
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

          <div className="flex shrink-0 items-center gap-0.5">
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
            <Home className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              className="h-full min-w-0 flex-1 border-none bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/50"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleRefresh();
                }
              }}
              placeholder="Enter URL..."
            />

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

          <button
            onClick={() => setIsToolbarHidden(!isToolbarHidden)}
            className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={isToolbarHidden ? "Show Toolbar" : "Auto-hide Toolbar"}
          >
            {isToolbarHidden ? (
              <PanelTopOpen className="size-3.5" />
            ) : (
              <PanelTopClose className="size-3.5" />
            )}
          </button>

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

      <div className="relative flex flex-1 justify-center overflow-hidden">
        {favoritesListOpen ? (
          <button
            type="button"
            aria-label="Close favorites"
            className="absolute inset-0 z-10 cursor-default bg-transparent"
            onClick={() => setFavoritesListOpen(false)}
          />
        ) : null}

        {activeUrl ? (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={activeUrl}
            onLoad={handleIframeLoad}
            className={cn(
              "h-full bg-white transition-all duration-300",
              viewMode === "mobile" ? "w-[375px] border-x border-border shadow-sm" : "w-full",
            )}
            title="Preview"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Enter a URL to preview
          </div>
        )}
      </div>
    </div>
  );
};
