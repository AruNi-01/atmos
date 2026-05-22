"use client";

import React from "react";
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
  cn,
} from "@workspace/ui";
import type { PreviewViewMode } from "@/lib/nuqs/searchParams";
import type { PreviewTransportMode } from "./preview-bridge/types";
import type { FavoriteSite } from "./preview-utils";

type ResolvedTransportMode = PreviewTransportMode | "unavailable";

interface PreviewToolbarProps {
  activeFavorite: FavoriteSite | null;
  activeUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  desktopToolbarExpanded: boolean;
  displayPageTitle: string;
  displayUrlParts: { protocol: string; address: string };
  effectiveIsToolbarHidden: boolean;
  elementPickerTitle: string;
  elementPickerTooltip: string;
  extensionDownloadStarted: boolean;
  extensionPopoverOpen: boolean;
  extensionUpdateAvailable: boolean;
  extensionUpdatePopoverOpen: boolean;
  favoriteNameDraft: string;
  favoritePopoverOpen: boolean;
  favoriteSearch: string;
  favorites: FavoriteSite[];
  favoritesListOpen: boolean;
  filteredFavorites: FavoriteSite[];
  isDownloadingExtension: boolean;
  isElementPickerEnabled: boolean;
  isElementPickerTooltipOpen: boolean;
  isMaximized: boolean;
  isRecheckingExtension: boolean;
  isUrlInputFocused: boolean;
  needsDesktopPreviewSafeInset: boolean;
  normalizedActiveUrl: string;
  preferredTransportMode: ResolvedTransportMode;
  renameDraft: string;
  renamingUrl: string | null;
  savingFavorite: boolean;
  shouldHideToolbarExternalActions: boolean;
  shouldHideToolbarNavigation: boolean;
  shouldHideToolbarStatus: boolean;
  shouldHideToolbarViewControls: boolean;
  shouldShowExtensionInstall: boolean;
  shouldShowToolbarToggle: boolean;
  shouldUseCompactToolbar: boolean;
  toolbarHoverSuppressed: boolean;
  toolbarRowRef: React.RefObject<HTMLDivElement | null>;
  toolbarToggleTitle: string;
  transportModeLabel: string;
  url: string;
  urlInputRef: React.RefObject<HTMLInputElement | null>;
  userEditedUrlRef: React.MutableRefObject<boolean>;
  usesDesktopToolbarExpand: boolean;
  usesToolbarHoverOverlay: boolean;
  viewMode: PreviewViewMode;
  focusUrlInput: () => void;
  handleAddFavorite: () => Promise<void>;
  handleDeleteFavorite: (site: FavoriteSite) => Promise<void>;
  handleDownloadExtension: () => Promise<void>;
  handleDownloadExtensionUpdate: () => Promise<void>;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleGoHome: () => void;
  handleRefresh: () => void;
  handleRenameFavorite: (site: FavoriteSite) => Promise<void>;
  handleRecheckExtension: () => Promise<void>;
  handleToggleElementPicker: () => Promise<void>;
  handleUrlInputBlur: () => void;
  navigateToUrl: (nextValue: string, pushHistory?: boolean) => void;
  setDesktopToolbarHovered: React.Dispatch<React.SetStateAction<boolean>>;
  setExtensionPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setExtensionUpdatePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setFavoriteNameDraft: React.Dispatch<React.SetStateAction<string>>;
  setFavoritePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setFavoriteSearch: React.Dispatch<React.SetStateAction<string>>;
  setFavoritesListOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsElementPickerTooltipOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMaximized: React.Dispatch<React.SetStateAction<boolean>>;
  setIsToolbarHidden: (nextIsToolbarHidden: boolean) => void;
  setRenameDraft: React.Dispatch<React.SetStateAction<string>>;
  setRenamingUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setUrl: (url: string) => void;
  setViewMode: (nextViewMode: PreviewViewMode) => void;
}

export function PreviewToolbar({
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
}: PreviewToolbarProps) {
  return (
    <div
      className={cn(
        "shrink-0",
        needsDesktopPreviewSafeInset && "pt-8",
        usesToolbarHoverOverlay && "group/toolbar relative z-10 h-3 overflow-visible",
        usesToolbarHoverOverlay && toolbarHoverSuppressed && "pointer-events-none",
        usesDesktopToolbarExpand && "min-h-3",
        usesDesktopToolbarExpand && toolbarHoverSuppressed && "pointer-events-none",
      )}
      onMouseEnter={usesDesktopToolbarExpand ? () => setDesktopToolbarHovered(true) : undefined}
      onMouseLeave={usesDesktopToolbarExpand ? () => setDesktopToolbarHovered(false) : undefined}
    >
      <div
        ref={toolbarRowRef}
        className={cn(
          "flex h-10 items-center gap-2 overflow-hidden bg-muted/10 px-2 transition-all duration-300 ease-in-out",
          usesToolbarHoverOverlay &&
            "absolute inset-x-0 top-0 z-20 -translate-y-full rounded-b-md border-b border-border/60 bg-background/92 opacity-0 shadow-lg backdrop-blur-md group-hover/toolbar:translate-y-0 group-hover/toolbar:opacity-100",
          usesToolbarHoverOverlay && needsDesktopPreviewSafeInset && "top-8",
          usesDesktopToolbarExpand &&
            cn(
              "border-b border-border/60 bg-background/92 backdrop-blur-md",
              desktopToolbarExpanded ? "opacity-100" : "opacity-0",
            ),
        )}
        style={usesDesktopToolbarExpand ? { height: desktopToolbarExpanded ? undefined : "0" } : undefined}
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
                viewMode === "desktop" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              title="Desktop View"
            >
              <Monitor className="size-3.5" />
            </button>
            <button
              onClick={() => setViewMode("mobile")}
              className={cn(
                "rounded-sm p-1.5 transition-colors",
                viewMode === "mobile" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              title="Mobile View"
            >
              <Smartphone className="size-3.5" />
            </button>
          </div>

          <FavoritesListPopover
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
              className="h-full min-w-0 flex-1 border-none bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              value={url ?? ""}
              onBlur={handleUrlInputBlur}
              onChange={(event) => {
                userEditedUrlRef.current = true;
                setUrl(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  userEditedUrlRef.current = false;
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
                  <span className="truncate text-xs text-foreground">{displayUrlParts.address}</span>
                  {displayPageTitle ? (
                    <span className="truncate text-xs text-muted-foreground">/ {displayPageTitle}</span>
                  ) : null}
                </>
              ) : (
                <span className="text-xs text-muted-foreground/50">Enter URL...</span>
              )}
            </button>
          )}

          <FavoriteSavePopover
            activeFavorite={activeFavorite}
            favoriteNameDraft={favoriteNameDraft}
            favoritePopoverOpen={favoritePopoverOpen}
            normalizedActiveUrl={normalizedActiveUrl}
            savingFavorite={savingFavorite}
            handleAddFavorite={handleAddFavorite}
            setFavoriteNameDraft={setFavoriteNameDraft}
            setFavoritePopoverOpen={setFavoritePopoverOpen}
          />
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
                      onClick={() => {
                        void handleToggleElementPicker();
                      }}
                      disabled={!activeUrl || preferredTransportMode === "unavailable"}
                      className={cn(
                        "flex h-6 cursor-pointer items-center justify-center px-2 leading-none transition-colors",
                        activeUrl && preferredTransportMode !== "unavailable"
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

            <PreviewExtensionUpdatePopover
              extensionUpdateAvailable={extensionUpdateAvailable}
              extensionUpdatePopoverOpen={extensionUpdatePopoverOpen}
              isDownloadingExtension={isDownloadingExtension}
              handleDownloadExtensionUpdate={handleDownloadExtensionUpdate}
              setExtensionUpdatePopoverOpen={setExtensionUpdatePopoverOpen}
            />

            <div className="h-5 w-px bg-border/60" />

            <PreviewExtensionInstallPopover
              extensionDownloadStarted={extensionDownloadStarted}
              extensionPopoverOpen={extensionPopoverOpen}
              isDownloadingExtension={isDownloadingExtension}
              isRecheckingExtension={isRecheckingExtension}
              shouldShowExtensionInstall={shouldShowExtensionInstall}
              transportModeLabel={transportModeLabel}
              handleDownloadExtension={handleDownloadExtension}
              handleRecheckExtension={handleRecheckExtension}
              setExtensionPopoverOpen={setExtensionPopoverOpen}
            />
          </div>
        ) : null}

        {shouldShowToolbarToggle ? (
          <button
            onClick={() => setIsToolbarHidden(!effectiveIsToolbarHidden)}
            className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={toolbarToggleTitle}
          >
            {effectiveIsToolbarHidden ? (
              <PanelTopOpen className="size-3.5" />
            ) : (
              <PanelTopClose className="size-3.5" />
            )}
          </button>
        ) : null}

        <button
          onClick={() => setIsMaximized(!isMaximized)}
          className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={isMaximized ? "Minimize" : "Maximize"}
        >
          {isMaximized ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

interface FavoritesListPopoverProps {
  favoriteSearch: string;
  favorites: FavoriteSite[];
  favoritesListOpen: boolean;
  filteredFavorites: FavoriteSite[];
  renameDraft: string;
  renamingUrl: string | null;
  handleDeleteFavorite: (site: FavoriteSite) => Promise<void>;
  handleRenameFavorite: (site: FavoriteSite) => Promise<void>;
  navigateToUrl: (nextValue: string, pushHistory?: boolean) => void;
  setFavoriteSearch: React.Dispatch<React.SetStateAction<string>>;
  setFavoritesListOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRenameDraft: React.Dispatch<React.SetStateAction<string>>;
  setRenamingUrl: React.Dispatch<React.SetStateAction<string | null>>;
}

function FavoritesListPopover({
  favoriteSearch,
  favorites,
  favoritesListOpen,
  filteredFavorites,
  renameDraft,
  renamingUrl,
  handleDeleteFavorite,
  handleRenameFavorite,
  navigateToUrl,
  setFavoriteSearch,
  setFavoritesListOpen,
  setRenameDraft,
  setRenamingUrl,
}: FavoritesListPopoverProps) {
  return (
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
                            <div className="truncate text-[11px] text-muted-foreground">{site.url}</div>
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
  );
}

interface FavoriteSavePopoverProps {
  activeFavorite: FavoriteSite | null;
  favoriteNameDraft: string;
  favoritePopoverOpen: boolean;
  normalizedActiveUrl: string;
  savingFavorite: boolean;
  handleAddFavorite: () => Promise<void>;
  setFavoriteNameDraft: React.Dispatch<React.SetStateAction<string>>;
  setFavoritePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function FavoriteSavePopover({
  activeFavorite,
  favoriteNameDraft,
  favoritePopoverOpen,
  normalizedActiveUrl,
  savingFavorite,
  handleAddFavorite,
  setFavoriteNameDraft,
  setFavoritePopoverOpen,
}: FavoriteSavePopoverProps) {
  return (
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
            <Button variant="outline" size="sm" onClick={() => setFavoritePopoverOpen(false)}>
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
  );
}

interface PreviewExtensionUpdatePopoverProps {
  extensionUpdateAvailable: boolean;
  extensionUpdatePopoverOpen: boolean;
  isDownloadingExtension: boolean;
  handleDownloadExtensionUpdate: () => Promise<void>;
  setExtensionUpdatePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function PreviewExtensionUpdatePopover({
  extensionUpdateAvailable,
  extensionUpdatePopoverOpen,
  isDownloadingExtension,
  handleDownloadExtensionUpdate,
  setExtensionUpdatePopoverOpen,
}: PreviewExtensionUpdatePopoverProps) {
  if (!extensionUpdateAvailable) return null;

  return (
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
          A newer version of the Atmos Inspector extension is available. Download and replace the old
          files to get the latest features and fixes.
        </p>
        <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
          <li>Download the new extension package below.</li>
          <li>
            Unzip and <span className="font-medium text-foreground">replace</span> the old{" "}
            <span className="font-medium text-foreground">atmos-inspector-extension</span> folder.
          </li>
          <li>
            Open <span className="font-medium text-foreground">chrome://extensions</span> and click
            the <span className="font-medium text-foreground">reload ↻</span> button on the extension
            card.
          </li>
          <li>Reload the target page in Atmos Preview.</li>
        </ol>
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setExtensionUpdatePopoverOpen(false)}>
            Later
          </Button>
          <Button
            size="sm"
            disabled={isDownloadingExtension}
            onClick={() => {
              void handleDownloadExtensionUpdate();
            }}
          >
            {isDownloadingExtension ? "Preparing…" : "Download update"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PreviewExtensionInstallPopoverProps {
  extensionDownloadStarted: boolean;
  extensionPopoverOpen: boolean;
  isDownloadingExtension: boolean;
  isRecheckingExtension: boolean;
  shouldShowExtensionInstall: boolean;
  transportModeLabel: string;
  handleDownloadExtension: () => Promise<void>;
  handleRecheckExtension: () => Promise<void>;
  setExtensionPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function PreviewExtensionInstallPopover({
  extensionDownloadStarted,
  extensionPopoverOpen,
  isDownloadingExtension,
  isRecheckingExtension,
  shouldShowExtensionInstall,
  transportModeLabel,
  handleDownloadExtension,
  handleRecheckExtension,
  setExtensionPopoverOpen,
}: PreviewExtensionInstallPopoverProps) {
  if (!shouldShowExtensionInstall) {
    return (
      <div className="flex h-6 items-center px-2 text-[11px] leading-none font-medium text-muted-foreground">
        {transportModeLabel}
      </div>
    );
  }

  return (
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
              The extension package has been downloaded. Pages that reject iframe embedding still need
              the desktop preview.
            </p>
            <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
              <li>
                Unzip <span className="font-medium text-foreground">atmos-inspector-extension.zip</span>.
              </li>
              <li>
                Open <span className="font-medium text-foreground">chrome://extensions</span> or{" "}
                <span className="font-medium text-foreground">edge://extensions</span>.
              </li>
              <li>
                Turn on <span className="font-medium text-foreground">Developer mode</span>.
              </li>
              <li>
                Click <span className="font-medium text-foreground">Load unpacked</span>.
              </li>
              <li>
                Select the extracted{" "}
                <span className="font-medium text-foreground">atmos-inspector-extension</span> folder.
              </li>
              <li>Return to Atmos and reload the target page, then start element selection again.</li>
            </ol>
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => setExtensionPopoverOpen(false)}>
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
                {isRecheckingExtension ? "Rechecking…" : "Recheck"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Cross-port element selection requires the Atmos Inspector extension. Pages that reject
              iframe embedding must use the desktop preview.
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => setExtensionPopoverOpen(false)}>
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
                  {isRecheckingExtension ? "Rechecking…" : "Recheck"}
                </Button>
                <Button
                  size="sm"
                  disabled={isDownloadingExtension}
                  onClick={() => {
                    void handleDownloadExtension();
                  }}
                >
                  {isDownloadingExtension ? "Preparing…" : "Install"}
                </Button>
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
