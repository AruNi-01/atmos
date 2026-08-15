"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Circle,
  GitCompare,
  LayoutDashboard,
  TabsList,
  TabsTab,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  X,
  getFileIconProps,
} from "@workspace/ui";
import {
  BookOpen,
  Bot,
  FileCheckCorner,
  GitPullRequest,
  GitMergeIcon,
  GitCommitHorizontal,
  Globe,
  Smartphone,
  SquareTerminal as TerminalIcon,
  Workflow,
} from "lucide-react";

import {
  EDITOR_REVIEW_DIFF_PREFIX,
  getEditorSourcePath,
  isConflictResolveEditorPath,
  isReviewGroupEditorPath,
  type OpenFile,
} from "@/features/editor/store/use-editor-store";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { useTerminalCenterTabPresentation } from "@/features/terminal/hooks/use-terminal-center-tab-presentation";
import { cn } from "@/shared/lib/utils";
import {
  TerminalTabAgentIndicatorWithPanes,
  type TabGroupItem,
} from "@/app-shell/center-stage-tabs";
import { preventNonPrimaryTabActivate } from "@/app-shell/center-stage-tab-model";

type SessionDisplay = {
  sessionTitle?: string | null;
  revisionLabel?: string | null;
} | null;

export type CenterStageSurfaceTabVariant =
  | "file"
  | "diff"
  | "diff-group"
  | "review-diff"
  | "conflict"
  | "github-pr"
  | "github-issue"
  | "github-action"
  | "github-commit"
  | "browser";

export function CenterStageTabList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsList
      variant="underline"
      className={cn(
        "h-10 w-full justify-start border-b border-sidebar-border px-0 bg-transparent overflow-hidden gap-0 items-stretch py-0! [&_[data-slot=tab-indicator]]:hidden",
        className,
      )}
    >
      {children}
    </TabsList>
  );
}

export function CenterStageScrollableTabs({
  children,
  className,
  scrollableTabsRef,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  scrollableTabsRef?: React.Ref<HTMLDivElement | null>;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      ref={scrollableTabsRef}
      className={cn("flex min-w-0 flex-1 overflow-x-auto no-scrollbar", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CenterStageStickyTabActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "z-20 flex h-full shrink-0 items-stretch border-l border-sidebar-border/70 bg-background/95 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CenterStageOverviewTab({
  className,
  tooltipContent,
  value = "overview",
}: {
  className?: string;
  tooltipContent?: React.ReactNode;
  value?: string;
}) {
  const t = useTranslations("appShell.centerStageSharedTabs");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTab
          value={value}
          onPointerDown={preventNonPrimaryTabActivate}
          className={cn(
            "h-full! pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none border-0!",
            className,
          )}
        >
          <LayoutDashboard className="size-3.5" />
        </TabsTab>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltipContent ?? t("overview")}</TooltipContent>
    </Tooltip>
  );
}

export function CenterStageFileIcon({
  className,
  name,
}: {
  className?: string;
  name: string;
}) {
  const iconProps = getFileIconProps({ name, isDir: false, className });
  // eslint-disable-next-line @next/next/no-img-element -- file icons are tiny decorative SVG/data assets from the UI package.
  return <img {...iconProps} alt="" />;
}

export function getCenterStageSurfaceTabVariant(path: string): CenterStageSurfaceTabVariant {
  if (path.startsWith(EDITOR_REVIEW_DIFF_PREFIX) || isReviewGroupEditorPath(path)) {
    return "review-diff";
  }
  if (isDiffGroupEditorPath(path)) {
    return "diff-group";
  }
  if (isConflictResolveEditorPath(path)) {
    return "conflict";
  }
  return "file";
}

export function BrowserTabFavicon({
  className,
  faviconUrl,
}: {
  className?: string;
  faviconUrl?: string | null;
}) {
  const resolvedFaviconUrl = faviconUrl?.trim() || "";

  return (
    <span className={cn("relative size-3.5 shrink-0", className)}>
      <Globe
        className={cn(
          "size-3.5 absolute inset-0 text-muted-foreground/70",
          resolvedFaviconUrl && "hidden",
        )}
      />
      {resolvedFaviconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Dynamic external favicons are tiny and may not be configured for next/image domains.
        <img
          key={resolvedFaviconUrl}
          src={resolvedFaviconUrl}
          alt=""
          className="size-3.5 absolute inset-0 rounded-[2px]"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            event.currentTarget.previousElementSibling?.classList.remove("hidden");
          }}
        />
      ) : null}
    </span>
  );
}

export function CenterStageSurfaceContentTab({
  closeLabel,
  faviconUrl,
  isDirty = false,
  isPreview = false,
  name,
  onClose,
  onContextMenu,
  onDoubleClick,
  path,
  tooltip,
  value,
  variant = "file",
}: {
  closeLabel?: string;
  faviconUrl?: string;
  isDirty?: boolean;
  isPreview?: boolean;
  name: string;
  onClose?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: () => void;
  path: string;
  tooltip?: React.ReactNode;
  value: string;
  variant?: CenterStageSurfaceTabVariant;
}) {
  const t = useTranslations("appShell.centerStageSharedTabs");
  const resolvedTooltip = tooltip ?? path;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTab
          value={value}
          className="!h-full pl-2 pr-1 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-1.5 group grow-0 shrink-0 justify-start rounded-none !border-0"
          onPointerDown={preventNonPrimaryTabActivate}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          {variant === "review-diff" ? (
            <FileCheckCorner className="size-3.5 shrink-0 text-blue-400" />
          ) : variant === "diff" || variant === "diff-group" ? (
            <GitCompare className="size-3.5 shrink-0 text-emerald-500" />
          ) : variant === "conflict" ? (
            <GitMergeIcon className="size-3.5 shrink-0 text-amber-500" />
          ) : variant === "github-pr" ? (
            <GitPullRequest className="size-3.5 shrink-0" />
          ) : variant === "github-issue" ? (
            <Circle className="size-3.5 shrink-0" />
          ) : variant === "github-action" ? (
            <Workflow className="size-3.5 shrink-0" />
          ) : variant === "github-commit" ? (
            <GitCommitHorizontal className="size-3.5 shrink-0" />
          ) : variant === "browser" ? (
            <BrowserTabFavicon faviconUrl={faviconUrl} />
          ) : (
            <CenterStageFileIcon name={name} className="size-3.5 shrink-0" />
          )}
          <span
            className={cn(
              "text-[13px] font-medium whitespace-nowrap max-w-[180px] truncate",
              variant === "review-diff" && "text-blue-400",
              variant === "diff-group" && "text-emerald-500",
              variant === "conflict" && "text-amber-500",
              isPreview && "italic",
            )}
          >
            {name}
          </span>
          <div className="relative size-4 flex items-center justify-center shrink-0 ml-0">
            {isDirty ? (
              <Circle className="size-1.5 fill-current text-muted-foreground group-hover:hidden" />
            ) : null}
            {onClose ? (
              <span
                role="button"
                aria-label={closeLabel ?? t("closeTab")}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
                className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-muted-foreground/20 rounded-sm cursor-pointer transition-all ease-out duration-200"
              >
                <X className="size-3" />
              </span>
            ) : null}
          </div>
        </TabsTab>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-md break-all">
        {resolvedTooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function CenterStageTerminalTabGroupItemContent({
  effectiveContextId,
  tab,
  label,
}: {
  effectiveContextId?: string;
  tab: TabGroupItem;
  label: (text: string) => React.ReactNode;
}) {
  // Reads customTitle + representative pane title from the terminal store.
  const presentation = useTerminalCenterTabPresentation({
    contextId: effectiveContextId ?? "",
    tabId: tab.value,
    fallbackTitle: tab.label,
  });

  const displayTitle = effectiveContextId ? presentation.displayTitle : tab.label;
  const toolbarAgent = effectiveContextId ? presentation.toolbarAgent : undefined;

  const leadingIcon = toolbarAgent ? (
    toolbarAgent.iconType === "built-in" ? (
      <AgentIcon
        registryId={toolbarAgent.id}
        name={toolbarAgent.label}
        size={14}
      />
    ) : (
      <Bot className="size-3.5 shrink-0 text-muted-foreground" />
    )
  ) : (
    <TerminalIcon className="size-3.5 shrink-0" />
  );

  return (
    <>
      {leadingIcon}
      {label(displayTitle)}
      {effectiveContextId ? (
        <TerminalTabAgentIndicatorWithPanes contextId={effectiveContextId} tabId={tab.value} />
      ) : null}
    </>
  );
}

export function CenterStageTabGroupItemContent({
  effectiveContextId,
  tab,
}: {
  effectiveContextId?: string;
  tab: TabGroupItem;
}) {
  const textClassName = cn(
    "min-w-0 flex-1 truncate text-[13px] font-medium whitespace-nowrap",
    (tab.kind === "diff" || tab.kind === "diff-group") && "text-emerald-500",
    tab.kind === "review-diff" && "text-blue-400",
    tab.kind === "conflict" && "text-amber-500",
    tab.file?.isPreview && "italic",
  );

  // data-tab-group-label is measured by SortableTabGroupItem for truncation tooltips.
  const label = (text: string) => (
    <span data-tab-group-label className={textClassName}>
      {text}
    </span>
  );

  if (tab.kind === "overview") {
    return (
      <>
        <LayoutDashboard className="size-3.5 shrink-0" />
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "wiki") {
    return (
      <>
        <BookOpen className="size-3.5 shrink-0" />
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "project-wiki") {
    return (
      <>
        <TerminalIcon className="size-3.5 shrink-0" />
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "code-review") {
    return (
      <>
        <TerminalIcon className="size-3.5 shrink-0 text-primary" />
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "terminal") {
    return (
      <CenterStageTerminalTabGroupItemContent
        effectiveContextId={effectiveContextId}
        tab={tab}
        label={label}
      />
    );
  }

  if (tab.kind === "github-pr" || tab.kind === "github-issue" || tab.kind === "github-action" || tab.kind === "github-commit") {
    return (
      <>
        {tab.kind === "github-pr" ? (
          <GitPullRequest className="size-3.5 shrink-0" />
        ) : tab.kind === "github-issue" ? (
          <Circle className="size-3.5 shrink-0" />
        ) : tab.kind === "github-action" ? (
          <Workflow className="size-3.5 shrink-0" />
        ) : (
          <GitCommitHorizontal className="size-3.5 shrink-0" />
        )}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "simulator") {
    return (
      <>
        <Smartphone className="size-3.5 shrink-0" />
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "git-history") {
    return (
      <>
        <GitCommitHorizontal className="size-3.5 shrink-0" />
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "browser") {
    return (
      <>
        <BrowserTabFavicon faviconUrl={tab.faviconUrl} />
        {label(tab.label)}
      </>
    );
  }

  if (!tab.file) {
    return (
      <>
        {tab.kind === "review-diff" ? (
          <FileCheckCorner className="size-3.5 shrink-0 text-blue-400" />
        ) : tab.kind === "diff" || tab.kind === "diff-group" ? (
          <GitCompare className="size-3.5 shrink-0 text-emerald-500" />
        ) : tab.kind === "conflict" ? (
          <GitMergeIcon className="size-3.5 shrink-0 text-amber-500" />
        ) : (
          <CenterStageFileIcon name={tab.label} className="size-3.5 shrink-0" />
        )}
        {label(tab.label)}
      </>
    );
  }

  return (
    <>
      {tab.kind === "review-diff" ? (
        <FileCheckCorner className="size-3.5 shrink-0 text-blue-400" />
      ) : tab.kind === "diff" || tab.kind === "diff-group" ? (
        <GitCompare className="size-3.5 shrink-0 text-emerald-500" />
      ) : tab.kind === "conflict" ? (
        <GitMergeIcon className="size-3.5 shrink-0 text-amber-500" />
      ) : (
        <CenterStageFileIcon name={tab.file.name} className="size-3.5 shrink-0" />
      )}
      {label(tab.file.name)}
      <span className="relative ml-auto flex size-4 shrink-0 items-center justify-center">
        {tab.file.isDirty ? <Circle className="size-1.5 fill-current text-muted-foreground" /> : null}
      </span>
    </>
  );
}

export function CenterStageOpenFileTab({
  closeLabel,
  displayPath: displayPathProp,
  file,
  onClose,
  onContextMenuRequest,
  onPreviewPin,
  sessionDisplay,
  tabValue,
  variant: variantProp,
}: {
  closeLabel?: string;
  displayPath?: string;
  file: OpenFile;
  onClose: (file: OpenFile) => void;
  onContextMenuRequest: (event: React.MouseEvent<HTMLButtonElement>, file: OpenFile) => void;
  onPreviewPin: (file: OpenFile) => void;
  sessionDisplay: SessionDisplay;
  tabValue?: string;
  variant?: CenterStageSurfaceTabVariant;
}) {
  const variant = variantProp ?? getCenterStageSurfaceTabVariant(file.path);
  const isReviewDiff = variant === "review-diff";
  const displayPath = displayPathProp ?? getEditorSourcePath(file.path);

  return (
    <CenterStageSurfaceContentTab
      value={tabValue ?? file.path}
      name={file.name}
      path={displayPath}
      variant={variant}
      isDirty={file.isDirty}
      isPreview={file.isPreview}
      closeLabel={closeLabel}
      onClose={() => onClose(file)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenuRequest(event, file);
      }}
      onDoubleClick={() => {
        if (file.isPreview) {
          onPreviewPin(file);
        }
      }}
      tooltip={
        <>
          {displayPath}
          {isReviewDiff && sessionDisplay && (sessionDisplay.sessionTitle || sessionDisplay.revisionLabel) ? (
            <span className="text-background/70">
              {" "}
              / {[sessionDisplay.sessionTitle, sessionDisplay.revisionLabel].filter(Boolean).join(" - ")}
            </span>
          ) : null}
        </>
      }
    />
  );
}
