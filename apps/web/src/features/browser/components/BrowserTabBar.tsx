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
  RotateCcwSquare,
  Trash2,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui";

import { useDesktopWindowDrag } from "@/shared/hooks/use-desktop-window-drag";
import { cn } from "@/shared/lib/utils";
import { extractCookieErrorCode, type CookieCmdErrorCode } from "../lib/browser-cookie-commands";
import { canonicalizeUrl } from "../lib/browser-utils";
import {
  MorphingTabs,
  type MorphingTabsItem,
} from "./morphing-tabs";

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
  // --- APP-041 Browser Cookie Sync (desktop + macOS 14+ only) ---
  cookieToolsAvailable?: boolean;
  onImportCookies?: () => void;
  onClearCache?: () => Promise<void>;
  onClearSiteData?: () => Promise<void>;
}

export interface BrowserTabBarProps {
  tabs: PreviewBrowserTab[];
  activeTabId: string;
  chromeControls?: PreviewBrowserChromeControls;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
  /** Called after a pointer drag or keyboard reorder completes. */
  onReorderTabs?: (tabIds: string[]) => void;
  /** Toolbar + viewport (or other surface content) live inside the morphing panel. */
  children?: React.ReactNode;
  className?: string;
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
  _index: number,
  fallbackLabels: { preview: string; newTab: string },
  tabCount = 1,
): string {
  const title = tab.title?.trim();
  const titleUrl = canonicalizeUrl(tab.titleUrl || "");
  const currentUrl = canonicalizeUrl(tab.activeUrl || tab.url);
  if (title && titleUrl && titleUrl === currentUrl) return title;

  const urlLabel = getUrlLabel(tab.activeUrl || tab.url);
  if (urlLabel) return urlLabel;

  // Do NOT key empty labels off array index — reordering would rename
  // "Browser" ↔ "New tab" and look like the tab texts swapped.
  // Solo empty surface keeps the product name; extras use New tab.
  return tabCount <= 1 ? fallbackLabels.preview : fallbackLabels.newTab;
}

function TabFavicon({ faviconUrl }: { faviconUrl?: string }) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [faviconUrl]);

  if (!faviconUrl || failed) {
    return <Globe className="size-3.5 text-muted-foreground/70" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Dynamic external favicons are tiny and may not be configured for next/image domains.
    <img
      key={faviconUrl}
      src={faviconUrl}
      alt=""
      className="size-3.5 rounded-[2px]"
      onError={() => setFailed(true)}
    />
  );
}

export function BrowserTabBar({
  tabs,
  activeTabId,
  chromeControls,
  onAddTab,
  onCloseTab,
  onSelectTab,
  onReorderTabs,
  children,
  className,
}: BrowserTabBarProps) {
  const t = useTranslations("browser.toolbar.browserTabs");
  const { handleDesktopWindowMouseDown, isDesktopDragEnabled } = useDesktopWindowDrag();
  const needsTrafficLightsInset = Boolean(chromeControls?.needsDesktopPreviewSafeInset);

  const items = React.useMemo<MorphingTabsItem[]>(
    () =>
      tabs.map((tab, index) => {
        const label = getTabLabel(
          tab,
          index,
          {
            preview: t("preview"),
            newTab: t("newTab"),
          },
          tabs.length,
        );
        return {
          id: tab.id,
          label,
          icon: <TabFavicon faviconUrl={tab.faviconUrl} />,
        };
      }),
    [t, tabs],
  );

  const trailing = chromeControls ? (
    <div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 pl-1.5">
      {chromeControls.favoritesList}
      <button
        type="button"
        aria-label={chromeControls.toolbarToggleTitle}
        title={chromeControls.toolbarToggleTitle}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground"
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
  ) : null;

  return (
    <MorphingTabs
      items={items}
      value={activeTabId}
      onValueChange={(id) => {
        if (id) onSelectTab(id);
      }}
      onClose={tabs.length > 1 ? onCloseTab : undefined}
      closeAriaLabel={(label) => t("closeTabAria", { label })}
      onOrderChange={onReorderTabs}
      onAdd={onAddTab}
      addAriaLabel={t("newTab")}
      ariaLabel={t("preview")}
      railInsetLeft={needsTrafficLightsInset ? 92 : 0}
      trailing={trailing}
      className={className}
      railProps={{
        "data-tauri-drag-region": isDesktopDragEnabled ? "true" : undefined,
        className: cn(isDesktopDragEnabled && "desktop-drag-region"),
        onMouseDown: handleDesktopWindowMouseDown,
      }}
    >
      {children}
    </MorphingTabs>
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
  const t = useTranslations("browser.toolbar");
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

  const handleMenuOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && clearing) return;
    setMenuOpen(nextOpen);
    if (!nextOpen) {
      closeClearPopover();
    }
  };

  const isSiteData = clearTarget === "site";

  return (
    <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("overflow.moreActions")}
          title={t("overflow.moreActions")}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground data-[state=open]:bg-background/70 data-[state=open]:text-foreground"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        data-atmos-browser-surface-overlay="true"
        className="z-[1001] w-72 p-3"
      >
        {clearTarget ? (
          clearPhase === "cleared" ? (
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
            <div className="space-y-3">
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
            </div>
          )
        ) : (
          <>
            {controls.onOpenInWindow ? (
              <DropdownMenuItem onSelect={() => controls.onOpenInWindow?.()}>
                <PictureInPicture2 className="size-4" />
                {controls.openInWindowTitle ?? t("actions.openBrowserWindow")}
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
              <DropdownMenuItem
                onSelect={() => {
                  setMenuOpen(false);
                  controls.onImportCookies?.();
                }}
              >
                <DownloadCloud className="size-4" />
                {t("cookieSync.menu.import")}
              </DropdownMenuItem>
            ) : null}
            {hasClearCache ? (
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  openClearPopover("cache");
                }}
              >
                <Trash2 className="size-4" />
                {t("cookieSync.menu.clearCache")}
              </DropdownMenuItem>
            ) : null}
            {hasClearSiteData ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  openClearPopover("site");
                }}
              >
                <Eraser className="size-4" />
                {t("cookieSync.menu.clearSiteData")}
              </DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
