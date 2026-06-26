"use client";

import React from "react";
import {
  TabsTab,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  X,
  type DragEndEvent,
} from "@workspace/ui";
import {
  BookOpen,
  LoaderCircle,
  Plus,
  RotateCw,
  SquareTerminal as TerminalIcon,
} from "lucide-react";
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
  CenterStageStickyTabActions,
  CenterStageTabGroupItemContent,
  CenterStageTabList,
} from "@/app-shell/center-stage-shared-tabs";
import type { FileTabContextMenuState } from "@/app-shell/center-stage-file-menu";

type SessionDisplay = {
  sessionTitle?: string | null;
  revisionLabel?: string | null;
} | null;

interface CenterStageTabBarProps {
  activeValue: string;
  codeReviewTabVisible: boolean;
  effectiveContextId: string;
  openFiles: OpenFile[];
  orderedGroupedTabItems: Array<{ key: string; label: string; tabs: TabGroupItem[] }>;
  projectWikiTabVisible: boolean;
  scrollableTabsRef: React.RefObject<HTMLDivElement | null>;
  sessionDisplay: SessionDisplay;
  tabGroupDndSensors: React.ComponentProps<typeof CenterStageTabGroupPopover>["sensors"];
  tabGroupPopoverOpen: boolean;
  termTabPlusHoveredTabId: string | null;
  visibleTerminalTabs: Array<{ id: string; title: string; closable: boolean }>;
  wikiCenterEligible: boolean;
  wikiRefreshing: boolean;
  handleCenterStageTabChange: (value: string) => void;
  handleCloseTabGroupItem: (tab: TabGroupItem) => void;
  handleCloseFile: (file: OpenFile) => void;
  handleCloseTerminalCenterTab: (tabId: string) => void;
  handleCreateTerminalCenterTab: () => void;
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
  codeReviewTabVisible,
  effectiveContextId,
  openFiles,
  orderedGroupedTabItems,
  projectWikiTabVisible,
  scrollableTabsRef,
  sessionDisplay,
  tabGroupDndSensors,
  tabGroupPopoverOpen,
  termTabPlusHoveredTabId,
  visibleTerminalTabs,
  wikiCenterEligible,
  wikiRefreshing,
  handleCenterStageTabChange,
  handleCloseTabGroupItem,
  handleCloseFile,
  handleCloseTerminalCenterTab,
  handleCreateTerminalCenterTab,
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
  const renderTabGroupItemContent = React.useCallback((tab: TabGroupItem) => {
    return <CenterStageTabGroupItemContent effectiveContextId={effectiveContextId} tab={tab} />;
  }, [effectiveContextId]);

  return (
    <CenterStageTabList>
      <CenterStageOverviewTab
        tooltipContent={
          <div className="flex items-center gap-2">
            <span>Overview</span>
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
                  aria-label="Refresh Wiki"
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
            {activeValue === "wiki" ? "Refresh Wiki" : "Project Wiki"}
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
              tab={tab}
              onClose={handleCloseTerminalCenterTab}
              onCreateTab={handleCreateTerminalCenterTab}
              setHoveredTabId={setTermTabPlusHoveredTabId}
            />
          ))}

        {projectWikiTabVisible ? (
          <SpecialTerminalTab
            closeLabel="Close Project Wiki tab"
            icon={<TerminalIcon className="size-3.5 shrink-0" />}
            label="Project Wiki"
            tooltip="Project Wiki Terminal"
            variant="project-wiki"
            value="project-wiki"
            onClose={() => setProjectWikiCloseConfirmOpen(true)}
          />
        ) : null}

        {codeReviewTabVisible ? (
          <SpecialTerminalTab
            closeLabel="Close Code Review tab"
            icon={<TerminalIcon className="size-3.5 shrink-0 text-blue-500" />}
            label="Code Review"
            tooltip="Code Review Terminal"
            variant="code-review"
            value="code-review"
            onClose={() => setCodeReviewCloseConfirmOpen(true)}
          />
        ) : null}

        {openFiles.map((file) => (
          <CenterStageOpenFileTab
            key={file.path}
            file={file}
            sessionDisplay={sessionDisplay}
            onClose={handleCloseFile}
            onContextMenuRequest={(event, nextFile) => {
              setActiveFile(nextFile.path, effectiveContextId);
              setTabContextMenu({ x: event.clientX, y: event.clientY, filePath: nextFile.path });
            }}
            onPreviewPin={(nextFile) => pinFile(nextFile.path, effectiveContextId)}
          />
        ))}
      </CenterStageScrollableTabs>

      <CenterStageStickyTabActions>
        {visibleTerminalTabs.length === 0 ? (
          <EmptyTerminalTabsAddButton onCreateTab={handleCreateTerminalCenterTab} />
        ) : null}
        <CenterStageTabGroupPopover
          open={tabGroupPopoverOpen}
          onOpenChange={setTabGroupPopoverOpen}
          groups={orderedGroupedTabItems}
          activeValue={activeValue}
          sensors={tabGroupDndSensors}
          onDragEnd={handleTabGroupDragEnd}
          onSelect={(value) => {
            handleCenterStageTabChange(value);
            setTabGroupPopoverOpen(false);
          }}
          onClose={handleCloseTabGroupItem}
          isClosable={isTabGroupItemClosable}
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
    tab.kind === "conflict"
  );
}

function TerminalExtraTab({
  activeValue,
  effectiveContextId,
  hasShortcut,
  hoveredTabId,
  shortcutDigit,
  tab,
  onClose,
  onCreateTab,
  setHoveredTabId,
}: {
  activeValue: string;
  effectiveContextId: string;
  hasShortcut: boolean;
  hoveredTabId: string | null;
  shortcutDigit: number;
  tab: { id: string; title: string };
  onClose: (tabId: string) => void;
  onCreateTab: () => void;
  setHoveredTabId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTab
          value={tab.id}
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
              />
            ) : null}
          </span>
          <span className="text-[13px] font-medium whitespace-nowrap">{tab.title}</span>
          <TerminalTabAgentIndicatorWithPanes contextId={effectiveContextId} tabId={tab.id} />
          <div
            className={cn(
              "absolute right-0 top-1/2 z-10 flex h-full -translate-y-1/2 items-center rounded-r-sm bg-linear-to-l from-muted/25 to-transparent pl-2.5 pr-1.5 backdrop-blur-[4px] transition-opacity duration-200",
              activeValue === tab.id ? "opacity-0 group-hover/term-tab:opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            <span
              role="button"
              aria-label={`Close ${tab.title}`}
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
              <span>New Terminal Tab</span>
              <ShortcutHint digit="T" />
            </>
          ) : (
            <>
              <span>{tab.title}</span>
              {hasShortcut ? <ShortcutHint digit={shortcutDigit} /> : null}
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function EmptyTerminalTabsAddButton({ onCreateTab }: { onCreateTab: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="New Terminal Tab"
          onClick={onCreateTab}
          className="flex h-full w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="flex items-center gap-2">
          <span>New Terminal Tab</span>
          <ShortcutHint digit="T" />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CreateTerminalTabButton({
  groupName,
  onCreateTab,
  onHoverChange,
}: {
  groupName: "term-tab";
  onCreateTab: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="New Terminal Tab"
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
