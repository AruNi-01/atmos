"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Circle,
  GitCompare,
  LayoutDashboard,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  X,
  getFileIconProps,
} from "@workspace/ui";
import {
  Tabs as MotionTabs,
  TabsList as MotionTabsList,
  TabsTrigger as MotionTabsTrigger,
} from "@workspace/ui/components/motion/tabs";
import {
  BookOpen,
  Bot,
  FileCheckCorner,
  FileDiff,
  FolderTree,
  GitBranch,
  GitPullRequest,
  GitMergeIcon,
  GitCommitHorizontal,
  GitGraph,
  Globe,
  MessagesSquare,
  Play,
  Smartphone,
  SquareTerminal as TerminalIcon,
  Workflow,
} from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";

import {
  EDITOR_REVIEW_DIFF_PREFIX,
  getEditorDisplayPath,
  isConflictResolveEditorPath,
  isReviewGroupEditorPath,
  type OpenFile,
} from "@/features/editor/store/use-editor-store";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { useTerminalCenterTabPresentation } from "@/features/terminal/hooks/use-terminal-center-tab-presentation";
import { cn } from "@/shared/lib/utils";
import { CenterTabHeldShortcut } from "@/app-shell/HeldShortcutBadge";
import {
  AgentChatTabStatusIndicator,
  CenterStageShortcutTooltipBody,
  TerminalTabAgentIndicatorWithPanes,
  type TabGroupItem,
} from "@/app-shell/center-stage-tabs";
import { preventNonPrimaryTabActivate } from "@/app-shell/center-stage-tab-model";

/** Tasks-page motion pill trigger density, on Atmos surfaces. */
export const CENTER_STAGE_TAB_CLASS =
  "pointer-events-auto group h-7 shrink-0 gap-1.5 px-1.5 text-xs aria-selected:!text-foreground";

export const CENTER_STAGE_TAB_INDICATOR_CLASS = "bg-active";

/** Icon-only pills stay circular (h-7) instead of collapsing into an oval. */
export const CENTER_STAGE_ICON_TAB_CLASS = "w-7 px-0";

/** Hover control that replaces the leading tab icon. Defaults to close. */
export function CenterStageTabCloseButton({
  children,
  className,
  label,
  onClose,
}: {
  children?: React.ReactNode;
  className?: string;
  label: string;
  onClose: () => void;
}) {
  return (
    <span
      role="button"
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      className={cn(
        "flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-current/15",
        className,
      )}
    >
      {children ?? <X className="size-3" />}
    </span>
  );
}

/** Leading glyph that swaps to close, or a custom hover action, on tab hover. */
export function CenterStageTabIconSlot({
  children,
  closeLabel,
  hoverIcon,
  hoverLabel,
  onClose,
  onHoverAction,
}: {
  children: React.ReactNode;
  closeLabel?: string;
  hoverIcon?: React.ReactNode;
  hoverLabel?: string;
  onClose?: () => void;
  onHoverAction?: () => void;
}) {
  const hover = onClose
    ? { label: closeLabel ?? "", icon: <X className="size-3" />, onAction: onClose }
    : onHoverAction
      ? { label: hoverLabel ?? "", icon: hoverIcon, onAction: onHoverAction }
      : null;

  return (
    <span className="relative flex size-3.5 shrink-0 items-center justify-center">
      <span className={cn("flex items-center justify-center", hover && "group-hover:invisible")}>
        {children}
      </span>
      {hover ? (
        <CenterStageTabCloseButton
          label={hover.label}
          onClose={hover.onAction}
          className="absolute inset-0 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100"
        >
          {hover.icon}
        </CenterStageTabCloseButton>
      ) : null}
    </span>
  );
}

export const CenterStageTab = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof MotionTabsTrigger>
>(function CenterStageTab({ className, ...props }, ref) {
  return (
    <MotionTabsTrigger
      ref={ref}
      className={cn(CENTER_STAGE_TAB_CLASS, className)}
      indicatorClassName={CENTER_STAGE_TAB_INDICATOR_CLASS}
      {...props}
    />
  );
});

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
  actions,
  children,
  className,
  onValueChange,
  value,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onValueChange?: (value: string) => void;
  value: string;
}) {
  return (
    <div
      className={cn(
        "desktop-no-drag relative z-20 flex shrink-0 items-center gap-1.5 px-2 py-1",
        className,
      )}
    >
      <MotionTabs
        value={value}
        onValueChange={onValueChange}
        variant="pill"
        className="flex min-h-0 min-w-0 flex-1 items-center"
      >
        <MotionTabsList
          className="flex h-8 w-full min-w-0 justify-start gap-0.5 overflow-hidden bg-background p-0.5"
          indicatorClassName={CENTER_STAGE_TAB_INDICATOR_CLASS}
          trailing={actions}
        >
          {children}
        </MotionTabsList>
      </MotionTabs>
    </div>
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
      className={cn("flex min-w-0 flex-1 items-center overflow-x-auto no-scrollbar", className)}
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
        // Above the list-level active pill (z-0); opaque so scroll cannot show it through + / group chrome.
        "pointer-events-auto relative isolate z-20 flex h-7 shrink-0 items-center gap-0.5 bg-background",
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
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
        <CenterStageTab
          value={value}
          onPointerDown={(event) => {
            preventNonPrimaryTabActivate(event);
            event.stopPropagation();
          }}
          className={cn(CENTER_STAGE_ICON_TAB_CLASS, className)}
        >
          <LayoutDashboard className="size-3.5" />
        </CenterStageTab>
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
          "size-3.5 absolute inset-0 text-current/70",
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
  shortcutDigit,
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
  shortcutDigit?: number | null;
  tooltip?: React.ReactNode;
  value: string;
  variant?: CenterStageSurfaceTabVariant;
}) {
  const t = useTranslations("appShell.centerStageSharedTabs");
  const resolvedTooltip = tooltip ?? path;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CenterStageTab
          value={value}
          onPointerDown={preventNonPrimaryTabActivate}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          <CenterStageTabIconSlot
            closeLabel={onClose ? (closeLabel ?? t("closeTab")) : undefined}
            onClose={onClose}
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
          </CenterStageTabIconSlot>
          <span
            className={cn(
              "max-w-[180px] truncate whitespace-nowrap",
              variant === "review-diff" && "text-blue-400",
              variant === "diff-group" && "text-emerald-500",
              variant === "conflict" && "text-amber-500",
              isPreview && "italic",
            )}
          >
            {name}
          </span>
          {isDirty ? (
            <Circle className="size-1.5 shrink-0 fill-current group-hover:invisible" />
          ) : null}
          <CenterTabHeldShortcut digit={shortcutDigit} />
        </CenterStageTab>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-md break-all">
        <CenterStageShortcutTooltipBody digit={shortcutDigit}>
          {resolvedTooltip}
        </CenterStageShortcutTooltipBody>
      </TooltipContent>
    </Tooltip>
  );
}

function CenterStageTerminalTabGroupItemContent({
  effectiveContextId,
  tab,
  label,
  wrapLeading,
}: {
  effectiveContextId?: string;
  tab: TabGroupItem;
  label: (text: string) => React.ReactNode;
  wrapLeading: (node: React.ReactNode) => React.ReactNode;
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
      {wrapLeading(leadingIcon)}
      {label(displayTitle)}
      {effectiveContextId ? (
        <TerminalTabAgentIndicatorWithPanes contextId={effectiveContextId} tabId={tab.value} />
      ) : null}
    </>
  );
}

export function CenterStageTabGroupItemContent({
  closeLabel,
  effectiveContextId,
  onClose,
  tab,
}: {
  closeLabel?: string;
  effectiveContextId?: string;
  onClose?: () => void;
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

  const leading = (node: React.ReactNode) => (
    <CenterStageTabIconSlot closeLabel={closeLabel} onClose={onClose}>
      {node}
    </CenterStageTabIconSlot>
  );

  if (tab.kind === "overview") {
    return (
      <>
        {leading(<LayoutDashboard className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "wiki") {
    return (
      <>
        {leading(<BookOpen className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "project-wiki") {
    return (
      <>
        {leading(<TerminalIcon className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "code-review") {
    return (
      <>
        {leading(<TerminalIcon className="size-3.5 shrink-0 text-primary" />)}
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
        wrapLeading={leading}
      />
    );
  }

  if (tab.kind === "github-pr" || tab.kind === "github-issue" || tab.kind === "github-action" || tab.kind === "github-commit") {
    return (
      <>
        {leading(
          tab.kind === "github-pr" ? (
            <GitPullRequest className="size-3.5 shrink-0" />
          ) : tab.kind === "github-issue" ? (
            <Circle className="size-3.5 shrink-0" />
          ) : tab.kind === "github-action" ? (
            <Workflow className="size-3.5 shrink-0" />
          ) : (
            <GitCommitHorizontal className="size-3.5 shrink-0" />
          ),
        )}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "simulator") {
    return (
      <>
        {leading(<Smartphone className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "git-history") {
    return (
      <>
        {leading(<GitGraph className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "changes") {
    return (
      <>
        {leading(<GitBranch className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "review") {
    return (
      <>
        {leading(<FileDiff className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "run") {
    return (
      <>
        {leading(<Play className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "github") {
    return (
      <>
        {leading(<Github className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "files") {
    return (
      <>
        {leading(<FolderTree className="size-3.5 shrink-0" />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "browser") {
    return (
      <>
        {leading(<BrowserTabFavicon faviconUrl={tab.faviconUrl} />)}
        {label(tab.label)}
      </>
    );
  }

  if (tab.kind === "agent-chat") {
    const providerId = tab.providerId?.trim() || "";
    const chatId = tab.chatId?.trim() || "";
    return (
      <>
        {leading(
          providerId ? (
            <AgentIcon registryId={providerId} name={providerId} size={14} />
          ) : (
            <MessagesSquare className="size-3.5 shrink-0" />
          ),
        )}
        {label(tab.label)}
        {chatId ? <AgentChatTabStatusIndicator chatId={chatId} /> : null}
      </>
    );
  }

  if (!tab.file) {
    return (
      <>
        {leading(
          tab.kind === "review-diff" ? (
            <FileCheckCorner className="size-3.5 shrink-0 text-blue-400" />
          ) : tab.kind === "diff" || tab.kind === "diff-group" ? (
            <GitCompare className="size-3.5 shrink-0 text-emerald-500" />
          ) : tab.kind === "conflict" ? (
            <GitMergeIcon className="size-3.5 shrink-0 text-amber-500" />
          ) : (
            <CenterStageFileIcon name={tab.label} className="size-3.5 shrink-0" />
          ),
        )}
        {label(tab.label)}
      </>
    );
  }

  return (
    <>
      {leading(
        tab.kind === "review-diff" ? (
          <FileCheckCorner className="size-3.5 shrink-0 text-blue-400" />
        ) : tab.kind === "diff" || tab.kind === "diff-group" ? (
          <GitCompare className="size-3.5 shrink-0 text-emerald-500" />
        ) : tab.kind === "conflict" ? (
          <GitMergeIcon className="size-3.5 shrink-0 text-amber-500" />
        ) : (
          <CenterStageFileIcon name={tab.file.name} className="size-3.5 shrink-0" />
        ),
      )}
      {label(tab.file.name)}
      {tab.file.isDirty ? (
        <Circle className="size-1.5 shrink-0 fill-current text-muted-foreground group-hover:invisible" />
      ) : null}
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
  shortcutDigit,
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
  shortcutDigit?: number | null;
  tabValue?: string;
  variant?: CenterStageSurfaceTabVariant;
}) {
  const variant = variantProp ?? getCenterStageSurfaceTabVariant(file.path);
  const isReviewDiff = variant === "review-diff";
  const displayPath = displayPathProp ?? getEditorDisplayPath(file.path);

  return (
    <CenterStageSurfaceContentTab
      value={tabValue ?? file.path}
      name={file.name}
      path={displayPath}
      variant={variant}
      isDirty={file.isDirty}
      isPreview={file.isPreview}
      shortcutDigit={shortcutDigit}
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
