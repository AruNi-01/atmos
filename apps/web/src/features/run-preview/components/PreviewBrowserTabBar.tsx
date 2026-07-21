"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  Eraser,
  Globe,
  Loader2,
  Maximize,
  Minimize,
  MoreHorizontal,
  PanelTopClose,
  PanelTopOpen,
  PictureInPicture,
  PictureInPicture2,
  Plus,
  RotateCcwSquare,
  Trash2,
  X,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@workspace/ui";

import { useDesktopWindowDrag } from "@/shared/hooks/use-desktop-window-drag";
import { cn } from "@/shared/lib/utils";
import { extractCookieErrorCode, type CookieCmdErrorCode } from "../lib/browser-cookie-commands";
import { canonicalizeUrl } from "../lib/preview-utils";

function scrollTabIntoView(
  container: HTMLElement,
  tab: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const containerRect = container.getBoundingClientRect();
  const tabRect = tab.getBoundingClientRect();
  const padding = 8;

  if (tabRect.left < containerRect.left + padding) {
    container.scrollBy({
      left: tabRect.left - containerRect.left - padding,
      behavior,
    });
    return;
  }

  if (tabRect.right > containerRect.right - padding) {
    container.scrollBy({
      left: tabRect.right - containerRect.right + padding,
      behavior,
    });
  }
}

export interface PreviewBrowserTab {
  id: string;
  url: string;
  activeUrl: string;
  title?: string;
  titleUrl?: string;
  faviconUrl?: string;
  lastAccessedAt?: number;
}

export interface PreviewBrowserChromeControls {
  favoritesList?: React.ReactNode;
  isMaximized: boolean;
  isToolbarHidden: boolean;
  needsDesktopPreviewSafeInset: boolean;
  openInWindowTitle?: string;
  returnToEmbeddedTitle?: string;
  moveToCenterTitle?: string;
  toolbarToggleTitle: string;
  onOpenInWindow?: () => void;
  onReturnToEmbedded?: () => void;
  onMoveToCenter?: () => void;
  onToggleMaximized?: () => void;
  onToggleToolbarHidden: () => void;
  // --- APP-040 Browser Cookie Sync (desktop + macOS 14+ only) ---
  // Additive optional props: web/mobile callers omit them, so the cookie/clear
  // menu items stay hidden. When present, they appear inside the `···` overflow menu.
  cookieToolsAvailable?: boolean;
  onImportCookies?: () => void;
  onClearCache?: () => Promise<void>;
  onClearSiteData?: () => Promise<void>;
}

export interface PreviewBrowserTabBarProps {
  tabs: PreviewBrowserTab[];
  activeTabId: string;
  chromeControls?: PreviewBrowserChromeControls;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
}

function getUrlLabel(value: string): string {
  if (!value.trim()) return "";

  try {
    const parsed = new URL(value);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return value.replace(/^https?:\/\//i, "");
  }
}

function getTabLabel(
  tab: PreviewBrowserTab,
  index: number,
  fallbackLabels: { preview: string; newTab: string },
): string {
  const title = tab.title?.trim();
  const titleUrl = canonicalizeUrl(tab.titleUrl || "");
  const currentUrl = canonicalizeUrl(tab.activeUrl || tab.url);
  if (title && titleUrl && titleUrl === currentUrl) return title;

  const urlLabel = getUrlLabel(tab.activeUrl || tab.url);
  if (urlLabel) return urlLabel;

  return index === 0 ? fallbackLabels.preview : fallbackLabels.newTab;
}

export function PreviewBrowserTabBar({
  tabs,
  activeTabId,
  chromeControls,
  onAddTab,
  onCloseTab,
  onSelectTab,
}: PreviewBrowserTabBarProps) {
  const t = useTranslations("preview.toolbar.browserTabs");
  const { handleDesktopWindowMouseDown, isDesktopDragEnabled } = useDesktopWindowDrag();
  const tabsScrollRef = React.useRef<HTMLDivElement>(null);
  const activeTabRef = React.useRef<HTMLDivElement>(null);

  // Keep the active tab in view — especially after "+" when many tabs overflow.
  React.useLayoutEffect(() => {
    const container = tabsScrollRef.current;
    const activeTab = activeTabRef.current;
    if (!container || !activeTab) return;

    // Instant on first layout after mount / tab-count jumps; smooth for normal switches.
    const behavior: ScrollBehavior = tabs.length > 1 ? "smooth" : "auto";
    scrollTabIntoView(container, activeTab, behavior);
  }, [activeTabId, tabs.length]);

  return (
    <div
      onMouseDown={handleDesktopWindowMouseDown}
      data-tauri-drag-region={isDesktopDragEnabled ? "true" : undefined}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 overflow-hidden bg-muted/10 px-2 select-none",
        isDesktopDragEnabled && "desktop-drag-region",
      )}
    >
      <div
        ref={tabsScrollRef}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden no-scrollbar",
          chromeControls?.needsDesktopPreviewSafeInset && "pl-[84px]",
        )}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const prevIsActive = index > 0 && tabs[index - 1]?.id === activeTabId;
          // Inactive tabs that are not adjacent to the active tab need a
          // vertical divider — active tabs already separate via border/highlight.
          const showLeadingDivider = !isActive && index > 0 && !prevIsActive;
          const label = getTabLabel(tab, index, {
            preview: t("preview"),
            newTab: t("newTab"),
          });
          const canClose = tabs.length > 1;

          return (
            <div
              key={tab.id}
              ref={isActive ? activeTabRef : undefined}
              className={cn(
                // Keep overflow visible so the leading divider (outside the tab box) is not clipped.
                "desktop-no-drag group/tab relative flex h-7 w-[156px] max-w-[42vw] shrink-0 items-center rounded-md border text-xs transition-colors",
                isActive
                  ? "border-border bg-background text-foreground shadow-sm"
                  : "border-transparent bg-transparent text-muted-foreground hover:bg-background/55 hover:text-foreground",
              )}
            >
              {showLeadingDivider ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-[-2px] top-1/2 h-3 w-px -translate-y-1/2 bg-border/70"
                />
              ) : null}
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left"
                title={label}
                onClick={() => onSelectTab(tab.id)}
              >
                <Globe
                  className={cn(
                    "size-3.5 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground/70",
                    tab.faviconUrl && "hidden",
                  )}
                />
                {tab.faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Dynamic external favicons are tiny and may not be configured for next/image domains.
                  <img
                    key={tab.faviconUrl}
                    src={tab.faviconUrl}
                    alt=""
                    className="size-3.5 shrink-0 rounded-[2px]"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                      event.currentTarget.previousElementSibling?.classList.remove("hidden");
                    }}
                  />
                ) : null}
                <span className="min-w-0 truncate text-[11px] font-medium">{label}</span>
              </button>

              {canClose ? (
                <button
                  type="button"
                  aria-label={t("closeTabAria", { label })}
                  title={t("closeTab")}
                  className={cn(
                    "mr-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
                    isActive ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          aria-label={t("newTab")}
          title={t("newTab")}
          className="desktop-no-drag flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          onClick={onAddTab}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {chromeControls ? (
        <div className="desktop-no-drag flex shrink-0 items-center gap-1 border-l border-border/70 pl-1">
          {chromeControls.favoritesList}
          <button
            type="button"
            aria-label={chromeControls.toolbarToggleTitle}
            title={chromeControls.toolbarToggleTitle}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            onClick={chromeControls.onToggleToolbarHidden}
          >
            {chromeControls.isToolbarHidden ? (
              <PanelTopOpen className="size-3.5" />
            ) : (
              <PanelTopClose className="size-3.5" />
            )}
          </button>
          <PreviewBrowserChromeOverflowMenu controls={chromeControls} />
        </div>
      ) : null}
    </div>
  );
}

interface PreviewBrowserChromeOverflowMenuProps {
  controls: PreviewBrowserChromeControls;
}

type ClearTarget = "cache" | "site";
type ClearPhase = "confirm" | "clearing" | "cleared" | "error";

/**
 * The `···` overflow menu (PRD MH-8..13). Surface controls (open in window,
 * return to embedded, move to center, maximize/minimize) render only when their
 * handler exists. Cookie tools (Import / Clear Cache / Clear Site Data & Cache)
 * render only on desktop + macOS 14+ (`cookieToolsAvailable`). The two clear
 * actions go through a secondary confirm popover anchored to this trigger and
 * report their result inline — never via a success toast.
 */
function PreviewBrowserChromeOverflowMenu({ controls }: PreviewBrowserChromeOverflowMenuProps) {
  const t = useTranslations("preview.toolbar");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [clearTarget, setClearTarget] = React.useState<ClearTarget | null>(null);
  const [clearPhase, setClearPhase] = React.useState<ClearPhase>("confirm");
  const [clearErrorCode, setClearErrorCode] = React.useState<CookieCmdErrorCode | null>(null);

  const showCookieTools = Boolean(controls.cookieToolsAvailable);
  const hasImport = showCookieTools && Boolean(controls.onImportCookies);
  const hasClearCache = showCookieTools && Boolean(controls.onClearCache);
  const hasClearSiteData = showCookieTools && Boolean(controls.onClearSiteData);
  const hasCookieTools = hasImport || hasClearCache || hasClearSiteData;

  const hasSurfaceControls = Boolean(
    controls.onOpenInWindow ||
      controls.onReturnToEmbedded ||
      controls.onMoveToCenter ||
      controls.onToggleMaximized,
  );

  // Nothing to show → don't render the trigger at all.
  if (!hasSurfaceControls && !hasCookieTools) {
    return null;
  }

  const closeClearPopover = () => {
    setClearTarget(null);
    setClearPhase("confirm");
    setClearErrorCode(null);
  };

  const openClearPopover = (target: ClearTarget) => {
    setClearErrorCode(null);
    setClearPhase("confirm");
    setClearTarget(target);
  };

  const runClear = async () => {
    if (!clearTarget) return;
    const handler = clearTarget === "cache" ? controls.onClearCache : controls.onClearSiteData;
    if (!handler) return;
    setClearPhase("clearing");
    setClearErrorCode(null);
    try {
      await handler();
      setClearPhase("cleared");
    } catch (error: unknown) {
      setClearErrorCode(extractCookieErrorCode(error));
      setClearPhase("error");
    }
  };

  const clearing = clearPhase === "clearing";
  const isSiteData = clearTarget === "site";

  return (
    <Popover
      open={clearTarget !== null}
      onOpenChange={(next) => {
        if (!next && !clearing) closeClearPopover();
      }}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("overflow.moreActions")}
              title={t("overflow.moreActions")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground data-[state=open]:bg-background data-[state=open]:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <DropdownMenuContent align="end" className="z-[1001] w-56">
          {controls.onOpenInWindow ? (
            <DropdownMenuItem onSelect={() => controls.onOpenInWindow?.()}>
              <PictureInPicture2 className="size-4" />
              {controls.openInWindowTitle ?? t("actions.openPreviewBrowserWindow")}
            </DropdownMenuItem>
          ) : null}
          {controls.onReturnToEmbedded ? (
            <DropdownMenuItem onSelect={() => controls.onReturnToEmbedded?.()}>
              <PictureInPicture className="size-4" />
              {controls.returnToEmbeddedTitle ?? t("actions.returnToEmbeddedPreview")}
            </DropdownMenuItem>
          ) : null}
          {controls.onMoveToCenter ? (
            <DropdownMenuItem onSelect={() => controls.onMoveToCenter?.()}>
              <RotateCcwSquare className="size-4" />
              {controls.moveToCenterTitle ?? t("browserTabs.moveToCenter")}
            </DropdownMenuItem>
          ) : null}
          {controls.onToggleMaximized ? (
            <DropdownMenuItem onSelect={() => controls.onToggleMaximized?.()}>
              {controls.isMaximized ? (
                <Minimize className="size-4" />
              ) : (
                <Maximize className="size-4" />
              )}
              {controls.isMaximized ? t("browserTabs.minimizePreview") : t("browserTabs.maximizePreview")}
            </DropdownMenuItem>
          ) : null}

          {hasSurfaceControls && hasCookieTools ? <DropdownMenuSeparator /> : null}

          {hasImport ? (
            <DropdownMenuItem onSelect={() => controls.onImportCookies?.()}>
              <DownloadCloud className="size-4" />
              {t("cookieSync.menu.import")}
            </DropdownMenuItem>
          ) : null}
          {hasClearCache ? (
            <DropdownMenuItem onSelect={() => openClearPopover("cache")}>
              <Trash2 className="size-4" />
              {t("cookieSync.menu.clearCache")}
            </DropdownMenuItem>
          ) : null}
          {hasClearSiteData ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => openClearPopover("site")}
            >
              <Eraser className="size-4" />
              {t("cookieSync.menu.clearSiteData")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="z-[1002] w-[320px] space-y-3 p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (clearing) event.preventDefault();
        }}
      >
        {clearPhase === "cleared" ? (
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {isSiteData ? t("cookieSync.clear.clearedSiteData") : t("cookieSync.clear.clearedCache")}
              </p>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={closeClearPopover}>
                  {t("cookieSync.clear.done")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {isSiteData ? t("cookieSync.clear.siteDataTitle") : t("cookieSync.clear.cacheTitle")}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isSiteData
                  ? t("cookieSync.clear.siteDataDescription")
                  : t("cookieSync.clear.cacheDescription")}
              </p>
            </div>

            {clearPhase === "error" && clearErrorCode ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                <p className="text-xs leading-relaxed text-foreground">
                  {t(`cookieSync.errors.${clearErrorCode}` as never)}
                </p>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={closeClearPopover} disabled={clearing}>
                {t("cookieSync.clear.cancel")}
              </Button>
              <Button
                variant={isSiteData ? "destructive" : "default"}
                size="sm"
                onClick={() => void runClear()}
                disabled={clearing}
              >
                {clearing ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("cookieSync.clear.clearing")}
                  </span>
                ) : clearPhase === "error" ? (
                  t("cookieSync.clear.retry")
                ) : isSiteData ? (
                  t("cookieSync.clear.confirmSiteData")
                ) : (
                  t("cookieSync.clear.confirmCache")
                )}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
