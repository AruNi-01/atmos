"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Code,
  Copy,
  ExternalLink,
  Home,
  MessageCirclePlus,
  Monitor,
  Puzzle,
  RotateCcw,
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
  isElementPickerEnabled: boolean;
  isElementPickerTooltipOpen: boolean;
  isPreviewLoading: boolean;
  isRecheckingExtension: boolean;
  isUrlInputFocused: boolean;
  needsDesktopPreviewSafeInset: boolean;
  normalizedActiveUrl: string;
  preferredTransportMode: ResolvedTransportMode;
  savingFavorite: boolean;
  selectionAnnotationCount: number;
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
  handleCopySelectionAnnotations: () => Promise<void>;
  handleOpenDeveloperTools: () => Promise<void>;
  handleRefresh: () => void;
  handleRecheckExtension: () => Promise<void>;
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
  isElementPickerEnabled,
  isElementPickerTooltipOpen,
  isPreviewLoading,
  isRecheckingExtension,
  isUrlInputFocused,
  needsDesktopPreviewSafeInset,
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
  setUrl,
  setViewMode,
}: PreviewToolbarProps) {
  const t = useTranslations("preview.toolbar");
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
          "flex items-center gap-2 overflow-hidden bg-muted/10 px-2 transition-all duration-300 ease-in-out",
          usesToolbarHoverOverlay || usesDesktopToolbarExpand ? "h-10" : "h-9",
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
              title={t("view.desktop")}
            >
              <Monitor className="size-3.5" />
            </button>
            <button
              onClick={() => setViewMode("mobile")}
              className={cn(
                "rounded-sm p-1.5 transition-colors",
                viewMode === "mobile" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              title={t("view.mobile")}
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
            title={t("navigation.back")}
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
            title={t("navigation.forward")}
          >
            <ArrowRight className="size-3.5" />
          </button>
          <button
            onClick={handleRefresh}
            className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={t("navigation.refresh")}
          >
            <RotateCcw className={cn("size-3.5", isPreviewLoading && "animate-spin")} />
          </button>
        </div>

        <div className="mx-0.5 flex h-7 min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md border border-border px-1.5">
          <button
            type="button"
            onClick={handleGoHome}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={t("navigation.home")}
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
              placeholder={t("url.enter")}
            />
          ) : (
            <button
              type="button"
              onClick={focusUrlInput}
              className="flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-sm px-0.5 text-left"
              title={url || t("url.enter")}
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
                <span className="text-xs text-muted-foreground/50">{t("url.enter")}</span>
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
            title={t("actions.openInBrowser")}
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
              {preferredTransportMode === "desktop-native" ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleOpenDeveloperTools();
                  }}
                  className="flex h-6 cursor-pointer items-center justify-center px-2 leading-none text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  title={t("actions.openDeveloperTools")}
                  aria-label={t("actions.openDeveloperTools")}
                >
                  <Code className="size-3.5" />
                </button>
              ) : null}

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

            {selectionAnnotationCount > 0 ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip disableHoverableContent>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCopySelectionAnnotations();
                      }}
                      className="group relative flex h-6 w-[66px] cursor-pointer items-center justify-center overflow-hidden border-l border-border/60 px-2 text-[11px] font-medium leading-none text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                      aria-label={t(
                        selectionAnnotationCount === 1
                          ? "annotations.copyAriaOne"
                          : "annotations.copyAriaOther",
                        { count: selectionAnnotationCount },
                      )}
                    >
                      <span className="absolute inset-0 inline-flex items-center justify-center gap-1 tabular-nums transition-all duration-150 ease-out group-hover:-translate-y-1 group-hover:opacity-0">
                        <MessageCirclePlus className="size-3" />
                        <span>{selectionAnnotationCount}</span>
                      </span>
                      <span className="absolute inset-0 inline-flex translate-y-1 items-center justify-center gap-1 opacity-0 transition-all duration-150 ease-out group-hover:translate-y-0 group-hover:opacity-100">
                        <Copy className="size-3" />
                        <span>{t("annotations.copy")}</span>
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-relaxed">
                    {t(
                      selectionAnnotationCount === 1
                        ? "annotations.copyTooltipOne"
                        : "annotations.copyTooltipOther",
                      { count: selectionAnnotationCount },
                    )}
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
  const t = useTranslations("preview.toolbar.favorite");
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
          title={activeFavorite ? t("edit") : t("add")}
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
              {activeFavorite ? t("edit") : t("save")}
            </p>
            <p className="break-all text-xs text-muted-foreground">
              {normalizedActiveUrl || t("noPageSelected")}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">{t("name")}</label>
            <Input
              value={favoriteNameDraft}
              onChange={(event) => setFavoriteNameDraft(event.target.value)}
              placeholder={t("namePlaceholder")}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setFavoritePopoverOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!normalizedActiveUrl || savingFavorite}
              onClick={() => void handleAddFavorite()}
            >
              {activeFavorite ? t("update") : t("saveAction")}
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
  const t = useTranslations("preview.toolbar.extensionUpdate");
  if (!extensionUpdateAvailable) return null;

  return (
    <Popover open={extensionUpdatePopoverOpen} onOpenChange={setExtensionUpdatePopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 cursor-pointer items-center px-1.5 text-[11px] leading-none font-medium text-emerald-400 transition-colors hover:text-emerald-300"
        >
          {t("trigger")}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="z-[1001] w-[320px] space-y-3 p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="text-xs font-medium text-foreground">{t("title")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
        <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
          <li>{t("steps.download")}</li>
          <li>
            {t("steps.unzipPrefix")} <span className="font-medium text-foreground">{t("steps.replace")}</span> {t("steps.unzipMiddle")}{" "}
            <span className="font-medium text-foreground">atmos-inspector-extension</span> folder.
          </li>
          <li>
            {t("steps.reloadPrefix")} <span className="font-medium text-foreground">chrome://extensions</span> {t("steps.reloadMiddle")}
            <span className="font-medium text-foreground">reload ↻</span> {t("steps.reloadSuffix")}
          </li>
          <li>{t("steps.reloadPage")}</li>
        </ol>
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setExtensionUpdatePopoverOpen(false)}>
            {t("later")}
          </Button>
          <Button
            size="sm"
            disabled={isDownloadingExtension}
            onClick={() => {
              void handleDownloadExtensionUpdate();
            }}
          >
            {isDownloadingExtension ? t("preparing") : t("downloadUpdate")}
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
  const t = useTranslations("preview.toolbar.extensionInstall");
  if (!shouldShowExtensionInstall) {
    return null;
  }

  return (
    <Popover open={extensionPopoverOpen} onOpenChange={setExtensionPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 cursor-pointer items-center justify-center px-2 leading-none text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          aria-label={t("trigger")}
          title={t("trigger")}
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
              {t("downloadedDescription")}
            </p>
            <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
              <li>
                {t("steps.unzip")} <span className="font-medium text-foreground">atmos-inspector-extension.zip</span>.
              </li>
              <li>
                {t("steps.open")} <span className="font-medium text-foreground">chrome://extensions</span> {t("steps.or")}{" "}
                <span className="font-medium text-foreground">edge://extensions</span>.
              </li>
              <li>
                {t("steps.turnOn")} <span className="font-medium text-foreground">{t("steps.developerMode")}</span>.
              </li>
              <li>
                {t("steps.click")} <span className="font-medium text-foreground">{t("steps.loadUnpacked")}</span>.
              </li>
              <li>
                {t("steps.selectExtracted")}{" "}
                <span className="font-medium text-foreground">atmos-inspector-extension</span> folder.
              </li>
              <li>{t("steps.returnAndReload")}</li>
            </ol>
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => setExtensionPopoverOpen(false)}>
                {t("close")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={isRecheckingExtension}
                onClick={() => {
                  void handleRecheckExtension();
                }}
              >
                {isRecheckingExtension ? t("rechecking") : t("recheck")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("description")}
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => setExtensionPopoverOpen(false)}>
                {t("close")}
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
                  {isRecheckingExtension ? t("rechecking") : t("recheck")}
                </Button>
                <Button
                  size="sm"
                  disabled={isDownloadingExtension}
                  onClick={() => {
                    void handleDownloadExtension();
                  }}
                >
                  {isDownloadingExtension ? t("preparing") : t("install")}
                </Button>
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
