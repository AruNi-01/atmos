"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Globe,
  Maximize,
  Minimize,
  PanelTopClose,
  PanelTopOpen,
  PictureInPicture,
  PictureInPicture2,
  Plus,
  X,
} from "lucide-react";

import { useDesktopWindowDrag } from "@/shared/hooks/use-desktop-window-drag";
import { cn } from "@/shared/lib/utils";
import { canonicalizeUrl } from "../lib/preview-utils";

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
  toolbarToggleTitle: string;
  onOpenInWindow?: () => void;
  onReturnToEmbedded?: () => void;
  onToggleMaximized?: () => void;
  onToggleToolbarHidden: () => void;
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
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden no-scrollbar",
          chromeControls?.needsDesktopPreviewSafeInset && "pl-[84px]",
        )}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const label = getTabLabel(tab, index, {
            preview: t("preview"),
            newTab: t("newTab"),
          });
          const canClose = tabs.length > 1;

          return (
            <div
              key={tab.id}
              className={cn(
                "desktop-no-drag group/tab flex h-7 w-[156px] max-w-[42vw] shrink-0 items-center overflow-hidden rounded-md border text-xs transition-colors",
                isActive
                  ? "border-border bg-background text-foreground shadow-sm"
                  : "border-transparent bg-transparent text-muted-foreground hover:bg-background/55 hover:text-foreground",
              )}
            >
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
          {chromeControls.onOpenInWindow ? (
            <button
              type="button"
              aria-label={chromeControls.openInWindowTitle}
              title={chromeControls.openInWindowTitle}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              onClick={chromeControls.onOpenInWindow}
            >
              <PictureInPicture2 className="size-3.5" />
            </button>
          ) : null}
          {chromeControls.onReturnToEmbedded ? (
            <button
              type="button"
              aria-label={chromeControls.returnToEmbeddedTitle}
              title={chromeControls.returnToEmbeddedTitle}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              onClick={chromeControls.onReturnToEmbedded}
            >
              <PictureInPicture className="size-3.5" />
            </button>
          ) : null}
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
          {chromeControls.onToggleMaximized ? (
            <button
              type="button"
              aria-label={chromeControls.isMaximized ? t("minimizePreview") : t("maximizePreview")}
              title={chromeControls.isMaximized ? t("minimize") : t("maximize")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              onClick={chromeControls.onToggleMaximized}
            >
              {chromeControls.isMaximized ? (
                <Minimize className="size-3.5" />
              ) : (
                <Maximize className="size-3.5" />
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
