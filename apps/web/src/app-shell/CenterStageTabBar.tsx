"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TabsTab,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  X,
  type DragEndEvent,
} from "@workspace/ui";
import {
  BookOpen,
  Globe,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCw,
  SquareTerminal as TerminalIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import { cn } from "@/shared/lib/utils";
import {
  CenterStageTabGroupPopover,
  CENTER_TERMINAL_SHORTCUT_LIMIT,
  ShortcutHint,
  TerminalTabAgentIndicatorWithPanes,
  type TabGroupItem,
} from "@/app-shell/center-stage-tabs";
import {
  CenterStageOpenFileTab,
  CenterStageOverviewTab,
  CenterStageScrollableTabs,
  CenterStageSurfaceContentTab,
  CenterStageStickyTabActions,
  CenterStageTabGroupItemContent,
  CenterStageTabList,
} from "@/app-shell/center-stage-shared-tabs";
import type { FileTabContextMenuState } from "@/app-shell/center-stage-file-menu";
import type { GithubCenterTab } from "@/features/github/store/use-github-center-tabs";
import type { BrowserCenterTab } from "@/features/run-preview/store/use-browser-center-tabs";
import {
  getActivePreviewBrowserFaviconUrl,
  getActivePreviewBrowserLabel,
  type PreviewBrowserPrefs,
} from "@/features/run-preview/lib/preview-browser-labels";

type SessionDisplay = {
  sessionTitle?: string | null;
  revisionLabel?: string | null;
} | null;

interface CenterStageTabBarProps {
  activeValue: string;
  browserFallbackLabel: string;
  browserTabs: BrowserCenterTab[];
  codeReviewTabVisible: boolean;
  effectiveContextId: string;
  githubTabs: GithubCenterTab[];
  isTabGroupItemActive: (tab: TabGroupItem) => boolean;
  openFiles: OpenFile[];
  orderedGroupedTabItems: Array<{ key: string; label: string; tabs: TabGroupItem[] }>;
  previewBrowserPrefs: PreviewBrowserPrefs;
  projectWikiTabVisible: boolean;
  scrollableTabsRef: React.RefObject<HTMLDivElement | null>;
  sessionDisplay: SessionDisplay;
  tabGroupDndSensors: React.ComponentProps<typeof CenterStageTabGroupPopover>["sensors"];
  tabGroupPopoverOpen: boolean;
  termTabPlusHoveredTabId: string | null;
  visibleTerminalTabs: Array<{ id: string; title: string; closable: boolean; customTitle?: string }>;
  wikiCenterEligible: boolean;
  wikiRefreshing: boolean;
  handleCenterStageTabChange: (value: string) => void;
  handleCloseTabGroupItem: (tab: TabGroupItem) => void;
  handleCloseBrowserTab: (value: string) => void;
  handleCloseFile: (file: OpenFile) => void;
  handleCloseGithubTab: (value: string) => void;
  handleCloseTerminalCenterTab: (tabId: string) => void;
  handleCreateBrowserCenterTab: () => void;
  handleCreateTerminalCenterTab: () => void;
  handleRenameTerminalCenterTab: (tabId: string, title: string) => void;
  handleSelectTabGroupItem: (tab: TabGroupItem) => void;
  handleTabGroupDragEnd: (event: DragEndEvent) => void;
  pinFile: (path: string, workspaceId?: string) => void;
  setActiveFile: (path: string | null, workspaceId?: string) => void;
  setCodeReviewCloseConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectWikiCloseConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTabContextMenu: (value: FileTabContextMenuState) => void;
  setTabGroupPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTermTabPlusHoveredTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setWikiRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setWikiRefreshTrigger: React.Dispatch<React.SetStateAction<number>>;
}

export function CenterStageTabBar({
  activeValue,
  browserFallbackLabel,
  browserTabs,
  codeReviewTabVisible,
  effectiveContextId,
  githubTabs,
  isTabGroupItemActive,
  openFiles,
  orderedGroupedTabItems,
  previewBrowserPrefs,
  projectWikiTabVisible,
  scrollableTabsRef,
  sessionDisplay,
  tabGroupDndSensors,
  tabGroupPopoverOpen,
  termTabPlusHoveredTabId,
  visibleTerminalTabs,
  wikiCenterEligible,
  wikiRefreshing,
  handleCenterStageTabChange: _handleCenterStageTabChange,
  handleCloseTabGroupItem,
  handleCloseBrowserTab,
  handleCloseFile,
  handleCloseGithubTab,
  handleCloseTerminalCenterTab,
  handleCreateBrowserCenterTab,
  handleCreateTerminalCenterTab,
  handleRenameTerminalCenterTab,
  handleSelectTabGroupItem,
  handleTabGroupDragEnd,
  pinFile,
  setActiveFile,
  setCodeReviewCloseConfirmOpen,
  setProjectWikiCloseConfirmOpen,
  setTabContextMenu,
  setTabGroupPopoverOpen,
  setTermTabPlusHoveredTabId,
  setWikiRefreshing,
  setWikiRefreshTrigger,
}: CenterStageTabBarProps) {
  const t = useTranslations("appShell");
  const newTerminalTabLabel = t("centerStageTabBar.newTerminalTab");
  const newBrowserLabel = t("centerStageTabBar.newBrowser");
  const newTabMenuLabel = t("centerStageTabBar.newTabMenu");

  const renderTabGroupItemContent = React.useCallback((tab: TabGroupItem) => {
    return <CenterStageTabGroupItemContent effectiveContextId={effectiveContextId} tab={tab} />;
  }, [effectiveContextId]);

  // Open files, GitHub, and Browser instances share one lane, ordered by when
  // each was opened (no per-type grouping) so tabs appear in natural open order.
  const orderedSurfaceTabs = React.useMemo<
    Array<
      | { type: "file"; openedAt: number; file: OpenFile }
      | { type: "github"; openedAt: number; tab: GithubCenterTab }
      | { type: "browser"; openedAt: number; tab: BrowserCenterTab }
    >
  >(() => {
    const items = [
      ...openFiles.map(
        (file) => ({ type: "file" as const, openedAt: file.lastOpenedAt, file }),
      ),
      ...githubTabs.map(
        (tab) => ({ type: "github" as const, openedAt: tab.openedAt, tab }),
      ),
      ...browserTabs.map(
        (tab) => ({ type: "browser" as const, openedAt: tab.openedAt, tab }),
      ),
    ];
    return items.sort((left, right) => left.openedAt - right.openedAt);
  }, [browserTabs, githubTabs, openFiles]);

  return (
    <CenterStageTabList>
      <CenterStageOverviewTab
        tooltipContent={
          <div className="flex items-center gap-2">
            <span>{t("centerStageTabBar.overview")}</span>
            <ShortcutHint digit={0} />
          </div>
        }
      />

      {wikiCenterEligible ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <TabsTab
              value="wiki"
              className="group/wiki relative h-full! pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none border-0!"
            >
              <span className="relative size-3.5">
                <BookOpen
                  className={cn(
                    "size-3.5 absolute inset-0 transition-all duration-200",
                    activeValue === "wiki"
                      ? "group-hover/wiki:opacity-0 group-hover/wiki:scale-50 group-hover/wiki:rotate-[-30deg]"
                      : "",
                  )}
                />
                {activeValue === "wiki" ? (
                  wikiRefreshing ? (
                    <LoaderCircle className="size-3.5 absolute inset-0 animate-spin" />
                  ) : (
                    <RotateCw
                      className={cn(
                        "size-3.5 absolute inset-0 transition-all duration-200",
                        "opacity-0 scale-50 rotate-60",
                        "group-hover/wiki:opacity-100 group-hover/wiki:scale-100 group-hover/wiki:rotate-0",
                      )}
                    />
                  )
                ) : null}
              </span>
              {activeValue === "wiki" ? (
                <span
                  role="button"
                  aria-label={t("centerStageTabBar.refreshWiki")}
                  className="absolute inset-0 opacity-0 group-hover/wiki:opacity-100 pointer-events-none group-hover/wiki:pointer-events-auto cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    setWikiRefreshing(true);
                    setWikiRefreshTrigger((key) => key + 1);
                    setTimeout(() => setWikiRefreshing(false), 600);
                  }}
                />
              ) : null}
            </TabsTab>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {activeValue === "wiki" ? t("centerStageTabBar.refreshWiki") : t("centerStageTabBar.projectWiki")}
          </TooltipContent>
        </Tooltip>
      ) : null}

      <CenterStageScrollableTabs scrollableTabsRef={scrollableTabsRef}>
        {visibleTerminalTabs
          .map((tab, index) => (
            <TerminalExtraTab
              key={tab.id}
              activeValue={activeValue}
              effectiveContextId={effectiveContextId}
              hasShortcut={index < CENTER_TERMINAL_SHORTCUT_LIMIT}
              hoveredTabId={termTabPlusHoveredTabId}
              shortcutDigit={index + 1}
              newTerminalTabLabel={newTerminalTabLabel}
              closeAriaLabel={t("centerStageTabBar.closeTab", { tab: tab.customTitle || tab.title })}
              tab={tab}
              onClose={handleCloseTerminalCenterTab}
              onCreateTab={handleCreateTerminalCenterTab}
              onRenameTab={handleRenameTerminalCenterTab}
              setHoveredTabId={setTermTabPlusHoveredTabId}
            />
          ))}

        {projectWikiTabVisible ? (
          <SpecialTerminalTab
            closeLabel={t("centerStageTabBar.closeProjectWikiTab")}
            icon={<TerminalIcon className="size-3.5 shrink-0" />}
            label={t("centerStageTabBar.projectWiki")}
            tooltip={t("centerStageTabBar.projectWikiTerminal")}
            variant="project-wiki"
            value="project-wiki"
            onClose={() => setProjectWikiCloseConfirmOpen(true)}
          />
        ) : null}

        {codeReviewTabVisible ? (
          <SpecialTerminalTab
            closeLabel={t("centerStageTabBar.closeCodeReviewTab")}
            icon={<TerminalIcon className="size-3.5 shrink-0 text-blue-500" />}
            label={t("centerStageTabBar.codeReview")}
            tooltip={t("centerStageTabBar.codeReviewTerminal")}
            variant="code-review"
            value="code-review"
            onClose={() => setCodeReviewCloseConfirmOpen(true)}
          />
        ) : null}

        {orderedSurfaceTabs.map((item) => {
          if (item.type === "file") {
            return (
              <CenterStageOpenFileTab
                key={item.file.path}
                file={item.file}
                sessionDisplay={sessionDisplay}
                onClose={handleCloseFile}
                onContextMenuRequest={(event, nextFile) => {
                  setActiveFile(nextFile.path, effectiveContextId);
                  setTabContextMenu({ x: event.clientX, y: event.clientY, filePath: nextFile.path });
                }}
                onPreviewPin={(nextFile) => pinFile(nextFile.path, effectiveContextId)}
              />
            );
          }

          if (item.type === "browser") {
            const browserContext =
              previewBrowserPrefs.byContext[item.tab.browserContextId];
            const label = getActivePreviewBrowserLabel(
              browserContext,
              browserFallbackLabel,
            );
            const faviconUrl = getActivePreviewBrowserFaviconUrl(browserContext);
            return (
              <CenterStageSurfaceContentTab
                key={item.tab.value}
                closeLabel={t("centerStageTabBar.closeTab", { tab: label })}
                faviconUrl={faviconUrl}
                name={label}
                onClose={() => handleCloseBrowserTab(item.tab.value)}
                path={label}
                tooltip={label}
                value={item.tab.value}
                variant="browser"
              />
            );
          }

          return (
            <CenterStageSurfaceContentTab
              key={item.tab.value}
              closeLabel={t("centerStageTabBar.closeTab", { tab: item.tab.label })}
              name={item.tab.label}
              onClose={() => handleCloseGithubTab(item.tab.value)}
              path={`${item.tab.owner}/${item.tab.repo}`}
              tooltip={item.tab.description || `${item.tab.owner}/${item.tab.repo}`}
              value={item.tab.value}
              variant={item.tab.kind}
            />
          );
        })}
      </CenterStageScrollableTabs>

      <CenterStageStickyTabActions>
        <CenterStageNewTabMenu
          browserLabel={newBrowserLabel}
          menuLabel={newTabMenuLabel}
          terminalLabel={newTerminalTabLabel}
          onCreateBrowser={handleCreateBrowserCenterTab}
          onCreateTerminal={handleCreateTerminalCenterTab}
        />
        <CenterStageTabGroupPopover
          open={tabGroupPopoverOpen}
          onOpenChange={setTabGroupPopoverOpen}
          groups={orderedGroupedTabItems}
          activeValue={activeValue}
          sensors={tabGroupDndSensors}
          onDragEnd={handleTabGroupDragEnd}
          onSelect={handleSelectTabGroupItem}
          onClose={handleCloseTabGroupItem}
          isClosable={isTabGroupItemClosable}
          isItemActive={isTabGroupItemActive}
          renderContent={renderTabGroupItemContent}
        />
      </CenterStageStickyTabActions>
    </CenterStageTabList>
  );
}

function isTabGroupItemClosable(tab: TabGroupItem) {
  return (
    tab.kind === "terminal" ||
    tab.kind === "project-wiki" ||
    tab.kind === "code-review" ||
    tab.kind === "file" ||
    tab.kind === "diff" ||
    tab.kind === "diff-group" ||
    tab.kind === "review-diff" ||
    tab.kind === "conflict" ||
    tab.kind === "github-pr" ||
    tab.kind === "github-action" ||
    tab.kind === "browser"
  );
}

function TerminalExtraTab({
  activeValue,
  effectiveContextId,
  hasShortcut,
  hoveredTabId,
  shortcutDigit,
  newTerminalTabLabel,
  closeAriaLabel,
  tab,
  onClose,
  onCreateTab,
  onRenameTab,
  setHoveredTabId,
}: {
  activeValue: string;
  effectiveContextId: string;
  hasShortcut: boolean;
  hoveredTabId: string | null;
  shortcutDigit: number;
  newTerminalTabLabel: string;
  closeAriaLabel: string;
  tab: { id: string; title: string; customTitle?: string };
  onClose: (tabId: string) => void;
  onCreateTab: () => void;
  onRenameTab: (tabId: string, title: string) => void;
  setHoveredTabId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const t = useTranslations("appShell");
  const displayTitle = tab.customTitle || tab.title;
  const [menuPos, setMenuPos] = React.useState<{ x: number; y: number } | null>(null);
  const [renameDraft, setRenameDraft] = React.useState(tab.customTitle ?? "");
  const skipBlurCommitRef = React.useRef(false);
  const [menuMounted, setMenuMounted] = React.useState(false);
  React.useEffect(() => {
    setMenuMounted(true);
  }, []);

  React.useEffect(() => {
    if (menuPos) {
      setRenameDraft(tab.customTitle ?? "");
      skipBlurCommitRef.current = false;
    }
  }, [menuPos, tab.customTitle]);

  const commitRename = () => {
    // Prevent the unmount-blur (fired when the menu closes) from committing twice.
    skipBlurCommitRef.current = true;
    onRenameTab(tab.id, renameDraft);
    setMenuPos(null);
  };

  const cancelRename = () => {
    // Escape / dismiss: discard the draft and close without committing.
    skipBlurCommitRef.current = true;
    setRenameDraft(tab.customTitle ?? "");
    setMenuPos(null);
  };

  const handleRenameBlur = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    // Persist the draft on blur but keep the menu open. Radix menu items steal
    // focus on pointer-move (item.focus()), so any mouse movement blurs this
    // input; closing here would collapse the whole menu on the first move.
    onRenameTab(tab.id, renameDraft);
  };

  // Focus the rename input only AFTER the submenu has mounted its focus scope
  // (which pauses the parent menu's focus trap) and registered as a dismissable
  // branch. Focusing synchronously via `autoFocus` during mount makes the root
  // menu treat the focus as an outside interaction and collapse the whole menu.
  const focusRenameInput = React.useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    requestAnimationFrame(() => el.focus());
  }, []);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <TabsTab
          value={tab.id}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuPos({ x: event.clientX, y: event.clientY });
          }}
          className="group/term-tab relative !h-full pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0"
        >
          <span className="relative flex size-4 shrink-0 items-center justify-center">
            <TerminalIcon
              className={cn(
                "size-3.5 transition-all duration-200",
                activeValue === tab.id
                  ? "group-hover/term-tab:opacity-0 group-hover/term-tab:scale-50 group-hover/term-tab:rotate-[-20deg]"
                  : "",
              )}
            />
            {activeValue === tab.id ? (
            <CreateTerminalTabButton
              groupName="term-tab"
              onCreateTab={onCreateTab}
              onHoverChange={(hovered) => setHoveredTabId(hovered ? tab.id : null)}
              newTerminalTabLabel={newTerminalTabLabel}
            />
          ) : null}
          </span>
          <span className="text-[13px] font-medium whitespace-nowrap">{displayTitle}</span>
          <TerminalTabAgentIndicatorWithPanes contextId={effectiveContextId} tabId={tab.id} />
          <div
            className={cn(
              "absolute right-0 top-1/2 z-10 flex h-full -translate-y-1/2 items-center rounded-r-sm bg-linear-to-l from-muted/25 to-transparent pl-2.5 pr-1.5 backdrop-blur-[4px] transition-opacity duration-200",
              activeValue === tab.id ? "opacity-0 group-hover/term-tab:opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            <span
              role="button"
              aria-label={closeAriaLabel}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.id);
              }}
              className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground cursor-pointer"
            >
              <X className="size-3" />
            </span>
          </div>
        </TabsTab>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="flex items-center gap-2">
          {hoveredTabId === tab.id ? (
            <>
              <span>{newTerminalTabLabel}</span>
              <ShortcutHint digit="T" />
            </>
          ) : (
            <>
              <span>{displayTitle}</span>
              {hasShortcut ? <ShortcutHint digit={shortcutDigit} /> : null}
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>

    {menuMounted
      ? createPortal(
          <DropdownMenu
            open={!!menuPos}
            onOpenChange={(open) => {
              if (!open) setMenuPos(null);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                className="fixed size-0 pointer-events-none"
                style={{ left: menuPos?.x ?? -9999, top: menuPos?.y ?? -9999 }}
              />
            </DropdownMenuTrigger>
            {/* Portal whole menu to body so app-shell transforms don't offset fixed anchors. */}
            <DropdownMenuContent align="start" sideOffset={4} className="z-[90] w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer">
                  <Pencil className="size-4 mr-2 text-muted-foreground" />
                  <span>{t("centerStageTabBar.renameTab")}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64 p-2">
                  <Input
                    ref={focusRenameInput}
                    value={renameDraft}
                    placeholder={t("centerStageTabBar.renameTabPlaceholder")}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitRename();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={handleRenameBlur}
                    className="h-8 text-sm"
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>,
          document.body,
        )
      : null}
    </>
  );
}

function CenterStageNewTabMenu({
  browserLabel,
  menuLabel,
  terminalLabel,
  onCreateBrowser,
  onCreateTerminal,
}: {
  browserLabel: string;
  menuLabel: string;
  terminalLabel: string;
  onCreateBrowser: () => void;
  onCreateTerminal: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const closeTimerRef = React.useRef<number | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-full w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground"
          onMouseEnter={() => {
            clearCloseTimer();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          onFocus={() => {
            clearCloseTimer();
            setOpen(true);
          }}
          onBlur={scheduleClose}
        >
          <Plus className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-44 border-border/70 bg-popover/90 p-1 shadow-lg backdrop-blur-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
          onClick={() => {
            onCreateTerminal();
            setOpen(false);
          }}
        >
          <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{terminalLabel}</span>
          <ShortcutHint digit="T" />
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
          onClick={() => {
            onCreateBrowser();
            setOpen(false);
          }}
        >
          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{browserLabel}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

function CreateTerminalTabButton({
  groupName,
  onCreateTab,
  onHoverChange,
  newTerminalTabLabel,
}: {
  groupName: "term-tab";
  onCreateTab: () => void;
  onHoverChange: (hovered: boolean) => void;
  newTerminalTabLabel: string;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={newTerminalTabLabel}
      className={cn(
        "absolute inset-0 -m-1 flex items-center justify-center rounded-md p-1 text-muted-foreground transition-all",
        "opacity-0 scale-50 rotate-60 pointer-events-none",
        groupName === "term-tab" && "group-hover/term-tab:opacity-100 group-hover/term-tab:scale-100 group-hover/term-tab:rotate-0 group-hover/term-tab:pointer-events-auto",
        "hover:bg-muted-foreground/20 hover:text-foreground",
      )}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      onClick={(event) => {
        event.stopPropagation();
        onCreateTab();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onCreateTab();
      }}
    >
      <Plus className="size-3.5" />
    </span>
  );
}

function SpecialTerminalTab({
  closeLabel,
  icon,
  label,
  tooltip,
  variant,
  value,
  onClose,
}: {
  closeLabel: string;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  variant: "project-wiki" | "code-review";
  value: string;
  onClose: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTab
          value={value}
          className={cn(
            "relative !h-full pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0",
            variant === "project-wiki" ? "group/pw" : "group/cr",
          )}
        >
          {icon}
          <span className="text-[13px] font-medium text-pretty">{label}</span>
          <div
            className={cn(
              "absolute right-0 top-1/2 z-10 flex h-full -translate-y-1/2 items-center pl-2 pr-1.5 backdrop-blur-[4px] [mask-image:linear-gradient(to_right,transparent,black_40%)] transition-opacity duration-200",
              variant === "project-wiki"
                ? "opacity-0 group-hover/pw:opacity-100"
                : "opacity-0 group-hover/cr:opacity-100",
            )}
          >
            <span
              role="button"
              aria-label={closeLabel}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground cursor-pointer"
            >
              <X className="size-3" />
            </span>
          </div>
        </TabsTab>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
