"use client";

import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Home,
  Monitor,
  PictureInPicture2,
  Puzzle,
  RotateCw,
  SquareMousePointer,
  Smartphone,
  Star,
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
import type { PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
import type { PreviewTransportMode } from "../lib/preview-bridge/types";
import type { FavoriteSite } from "../lib/preview-utils";

type ResolvedTransportMode = PreviewTransportMode | "unavailable";

interface PreviewToolbarProps {
  activeFavorite: FavoriteSite | null;
  activeUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  desktopToolbarExpanded: boolean;
  displayPageTitle: string;
  displayUrlParts: { protocol: string; address: string };
  elementPickerTitle: string;
  elementPickerTooltip: string;
  extensionDownloadStarted: boolean;
  extensionPopoverOpen: boolean;
  extensionUpdateAvailable: boolean;
  extensionUpdatePopoverOpen: boolean;
  favoriteNameDraft: string;
  favoritePopoverOpen: boolean;
  isDownloadingExtension: boolean;
  isDesktopPreviewDetached: boolean;
  isElementPickerEnabled: boolean;
  isElementPickerTooltipOpen: boolean;
  isRecheckingExtension: boolean;
  isUrlInputFocused: boolean;
  needsDesktopPreviewSafeInset: boolean;
  normalizedActiveUrl: string;
  preferredTransportMode: ResolvedTransportMode;
  savingFavorite: boolean;
  shouldHideToolbarExternalActions: boolean;
  shouldHideToolbarNavigation: boolean;
  shouldHideToolbarStatus: boolean;
  shouldHideToolbarViewControls: boolean;
  shouldShowExtensionInstall: boolean;
  shouldUseCompactToolbar: boolean;
  toolbarHoverSuppressed: boolean;
  toolbarRowRef: React.RefObject<HTMLDivElement | null>;
  url: string;
  urlInputRef: React.RefObject<HTMLInputElement | null>;
  userEditedUrlRef: React.MutableRefObject<boolean>;
  usesDesktopToolbarExpand: boolean;
  usesToolbarHoverOverlay: boolean;
  viewMode: PreviewViewMode;
  focusUrlInput: () => void;
  handleAddFavorite: () => Promise<void>;
  handleDownloadExtension: () => Promise<void>;
  handleDownloadExtensionUpdate: () => Promise<void>;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleGoHome: () => void;
  handleRefresh: () => void;
  handleRecheckExtension: () => Promise<void>;
  handleToggleDesktopPreviewDetached: () => Promise<void>;
  handleToggleElementPicker: () => Promise<void>;
  handleUrlInputBlur: () => void;
  setDesktopToolbarHovered: React.Dispatch<React.SetStateAction<boolean>>;
  setExtensionPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setExtensionUpdatePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setFavoriteNameDraft: React.Dispatch<React.SetStateAction<string>>;
  setFavoritePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsElementPickerTooltipOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
  elementPickerTitle,
  elementPickerTooltip,
  extensionDownloadStarted,
  extensionPopoverOpen,
  extensionUpdateAvailable,
  extensionUpdatePopoverOpen,
  favoriteNameDraft,
  favoritePopoverOpen,
  isDownloadingExtension,
  isDesktopPreviewDetached,
  isElementPickerEnabled,
  isElementPickerTooltipOpen,
  isRecheckingExtension,
  isUrlInputFocused,
  needsDesktopPreviewSafeInset,
  normalizedActiveUrl,
  preferredTransportMode,
  savingFavorite,
  shouldHideToolbarExternalActions,
  shouldHideToolbarNavigation,
  shouldHideToolbarStatus,
  shouldHideToolbarViewControls,
  shouldShowExtensionInstall,
  shouldUseCompactToolbar,
  toolbarHoverSuppressed,
  toolbarRowRef,
  url,
  urlInputRef,
  userEditedUrlRef,
  usesDesktopToolbarExpand,
  usesToolbarHoverOverlay,
  viewMode,
  focusUrlInput,
  handleAddFavorite,
  handleDownloadExtension,
  handleDownloadExtensionUpdate,
  handleGoBack,
  handleGoForward,
  handleGoHome,
  handleRefresh,
  handleRecheckExtension,
  handleToggleDesktopPreviewDetached,
  handleToggleElementPicker,
  handleUrlInputBlur,
  setDesktopToolbarHovered,
  setExtensionPopoverOpen,
  setExtensionUpdatePopoverOpen,
  setFavoriteNameDraft,
  setFavoritePopoverOpen,
  setIsElementPickerTooltipOpen,
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

            {preferredTransportMode === "desktop-native" ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip disableHoverableContent>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <button
                        onClick={() => {
                          void handleToggleDesktopPreviewDetached();
                        }}
                        disabled={!activeUrl}
                        className={cn(
                          "flex h-6 cursor-pointer items-center justify-center px-2 leading-none transition-colors",
                          activeUrl
                            ? isDesktopPreviewDetached
                              ? "text-blue-400 hover:bg-blue-400/10 hover:text-blue-300"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            : "cursor-not-allowed text-muted-foreground/30",
                        )}
                        aria-label={isDesktopPreviewDetached ? "Restore preview to sidebar" : "Detach preview window"}
                      >
                        <PictureInPicture2 className="size-3.5" />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-relaxed">
                    {isDesktopPreviewDetached
                      ? "Restore the desktop preview to the sidebar."
                      : "Open the desktop preview in a separate window."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}

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
              handleDownloadExtension={handleDownloadExtension}
              handleRecheckExtension={handleRecheckExtension}
              setExtensionPopoverOpen={setExtensionPopoverOpen}
            />
          </div>
        ) : null}

      </div>
    </div>
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
        className="z-[1001] w-[320px] p-4"
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
        className="z-[1001] w-[320px] space-y-3 p-3"
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
  handleDownloadExtension,
  handleRecheckExtension,
  setExtensionPopoverOpen,
}: PreviewExtensionInstallPopoverProps) {
  if (!shouldShowExtensionInstall) {
    return null;
  }

  return (
    <Popover open={extensionPopoverOpen} onOpenChange={setExtensionPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 cursor-pointer items-center justify-center px-2 leading-none text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          aria-label="Install preview extension"
          title="Install preview extension"
        >
          <Puzzle className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="z-[1001] w-[320px] space-y-3 p-3"
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
