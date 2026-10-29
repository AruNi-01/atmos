"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  getFileIconProps,
  ScrollArea,
} from "@workspace/ui";
import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Files,
  GitPullRequestArrow,
  Loader2,
  MessagesSquare,
} from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import type { GithubIssuePayload, GithubPrPayload } from "@/api/ws-api";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { getWorkspaceAgentGroupMeta } from "@/app-shell/sidebar/workspace-status";
import {
  AGENT_TOOL_ICON_IDS,
  AGENT_TOOL_LABELS,
  type AgentToolType,
} from "@/features/agent/store/agent-status-store";
import {
  isImmediateMentionListingQuery,
  splitHighlightParts,
} from "@/features/welcome/lib/mention-file-search";
import type { MentionFileCandidate } from "@/features/welcome/lib/welcome-page-helpers";
import { scrollActiveListItemIntoView } from "@/features/welcome/lib/popover-list-scroll";

export type MentionPopoverState = {
  top?: number;
  bottom?: number;
  left: number;
  atOffset: number;
  query: string;
} | null;

export type MentionNavItem =
  | { type: "agent-sessions" }
  | { type: "issue"; issue: GithubIssuePayload }
  | { type: "pr"; pr: GithubPrPayload }
  | { type: "file"; file: MentionFileCandidate };

export type MentionAgentSessionRow = {
  id: string;
  provider: string;
  chatId: string;
  title: string;
  tool: string;
  /** Agent status bucket. The row shows its icon, not the label. */
  groupKey: "permission" | "attention" | "running" | "done";
  /** Spoken label for the status icon. */
  status: string;
};

export type MentionAgentSessionsState = {
  view: "menu" | "sessions";
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  query: string;
  sessions: MentionAgentSessionRow[];
  onOpen: () => void;
  onBack: () => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
};

function MentionHighlightText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const parts = splitHighlightParts(text, query);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.match ? (
          <mark
            key={`${part.text}-${index}`}
            className="rounded-sm bg-primary/20 px-0.5 text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={`${part.text}-${index}`}>{part.text}</React.Fragment>
        ),
      )}
    </span>
  );
}

function mentionSessionAgentIcon(tool: string): { registryId: string; name: string } {
  if (Object.hasOwn(AGENT_TOOL_ICON_IDS, tool)) {
    const typed = tool as AgentToolType;
    return {
      registryId: AGENT_TOOL_ICON_IDS[typed],
      name: AGENT_TOOL_LABELS[typed],
    };
  }
  return {
    registryId: AGENT_TOOL_ICON_IDS.agent,
    name: AGENT_TOOL_LABELS.agent,
  };
}

/** Name segment after the last `/` — what name-only search actually matches. */
function mentionNameHighlightQuery(rawQuery: string): string {
  const query = rawQuery.trim().replace(/\\/g, "/");
  const slashIndex = query.lastIndexOf("/");
  if (slashIndex < 0) return query;
  return query.slice(slashIndex + 1).trim();
}

export function WelcomeMentionPopover({
  activeIndex,
  agentSessions = null,
  issuePreview,
  isLoading,
  listRef,
  mentionFiles,
  onClose,
  onSelectFile,
  onSelectNavItem,
  onSetItemRef,
  popover,
  prPreview,
  showAgentSessions = false,
}: {
  activeIndex: number;
  agentSessions?: MentionAgentSessionsState | null;
  issuePreview: GithubIssuePayload | null;
  isLoading: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  mentionFiles: MentionFileCandidate[];
  onClose: () => void;
  onSelectFile: (item: MentionFileCandidate) => void;
  onSelectNavItem: (item: MentionNavItem) => void;
  onSetItemRef: (index: number, element: HTMLButtonElement | null) => void;
  popover: MentionPopoverState;
  prPreview: GithubPrPayload | null;
  showAgentSessions?: boolean;
}) {
  const t = useTranslations("Welcome.components");
  const sessionsView = agentSessions?.view === "sessions";
  const menuPaneRef = React.useRef<HTMLDivElement | null>(null);
  const sessionsPaneRef = React.useRef<HTMLDivElement | null>(null);
  const sessionItemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [paneHeight, setPaneHeight] = React.useState<number | null>(null);
  const [sessionActiveIndex, setSessionActiveIndex] = React.useState(0);

  React.useLayoutEffect(() => {
    const node = sessionsView ? sessionsPaneRef.current : menuPaneRef.current;
    if (!node) return;
    setPaneHeight(node.scrollHeight);
  }, [
    sessionsView,
    isLoading,
    mentionFiles.length,
    issuePreview,
    prPreview,
    showAgentSessions,
    agentSessions?.loading,
    agentSessions?.loadingMore,
    agentSessions?.hasMore,
    agentSessions?.query,
    agentSessions?.sessions.length,
  ]);

  React.useEffect(() => {
    setSessionActiveIndex(0);
  }, [sessionsView, agentSessions?.query]);

  const sessionCount = agentSessions?.sessions.length ?? 0;
  const sessionNavCount = sessionCount + (agentSessions?.hasMore ? 1 : 0);
  const sessionCountRef = React.useRef(sessionCount);

  React.useEffect(() => {
    const previous = sessionCountRef.current;
    sessionCountRef.current = sessionCount;
    if (previous > 0 && sessionCount > previous && agentSessions?.hasMore) {
      setSessionActiveIndex((current) => (current === previous ? sessionCount : current));
    }
  }, [agentSessions?.hasMore, sessionCount]);

  React.useEffect(() => {
    setSessionActiveIndex((current) => {
      if (sessionNavCount <= 0) return 0;
      return current >= sessionNavCount ? sessionNavCount - 1 : current;
    });
  }, [sessionNavCount]);

  React.useEffect(() => {
    if (!sessionsView) return;
    const container = sessionsPaneRef.current;
    if (!container) return;
    scrollActiveListItemIntoView(container, sessionItemRefs.current, sessionActiveIndex, 3);
  }, [agentSessions?.hasMore, agentSessions?.sessions.length, sessionActiveIndex, sessionsView]);

  React.useEffect(() => {
    if (!sessionsView || !agentSessions) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        agentSessions.onBack();
        return;
      }
      if (event.key === "ArrowDown") {
        if (sessionNavCount === 0) return;
        event.preventDefault();
        setSessionActiveIndex((prev) => (prev + 1) % sessionNavCount);
        return;
      }
      if (event.key === "ArrowUp") {
        if (sessionNavCount === 0) return;
        event.preventDefault();
        setSessionActiveIndex((prev) => (prev - 1 + sessionNavCount) % sessionNavCount);
        return;
      }
      if (event.key === "Enter") {
        if (agentSessions.hasMore && sessionActiveIndex === agentSessions.sessions.length) {
          event.preventDefault();
          if (!agentSessions.loadingMore) agentSessions.onLoadMore();
          return;
        }
        const session = agentSessions.sessions[sessionActiveIndex];
        if (!session) return;
        event.preventDefault();
        agentSessions.onSelect(session.id);
      }
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [agentSessions, sessionActiveIndex, sessionNavCount, sessionsView]);

  if (!popover || typeof document === "undefined") return null;

  const agentSessionsIndex = showAgentSessions ? 0 : -1;
  const githubStart = showAgentSessions ? 1 : 0;
  const issueIndex = issuePreview ? githubStart : -1;
  const prIndex = prPreview ? githubStart + (issuePreview ? 1 : 0) : -1;
  const githubItemCount = (issuePreview ? 1 : 0) + (prPreview ? 1 : 0);
  const githubCount = (showAgentSessions ? 1 : 0) + githubItemCount;
  const nameHighlightQuery = mentionNameHighlightQuery(popover.query);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2147483646]" onMouseDown={onClose} />
      <div
        ref={listRef}
        className="fixed z-[2147483647] w-[min(90vw,460px)] overflow-hidden rounded-2xl border border-border/70 bg-popover text-sm text-popover-foreground shadow-md"
        style={{
          top: popover.top,
          bottom: popover.bottom,
          left: popover.left,
        }}
      >
        <div
          className="relative overflow-hidden transition-[height] duration-200 ease-out"
          style={{ height: paneHeight ?? undefined }}
        >
          <div
            ref={menuPaneRef}
            className={cn(
              "w-full transition-all duration-200 ease-out",
              sessionsView
                ? "pointer-events-none absolute inset-x-0 top-0 -translate-x-3 opacity-0"
                : "translate-x-0 opacity-100",
            )}
          >
            <ScrollArea
              scrollFade
              className="h-auto max-h-80 w-full"
              viewportClassName="h-auto max-h-80"
            >
              <div className="space-y-0.5 p-1">
                {githubItemCount > 0 ? (
                  <>
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
                      <Github className="size-3" />
                      <span>{t("mentionPopover.github")}</span>
                    </div>
                    {issuePreview ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            ref={(element) => {
                              onSetItemRef(issueIndex, element);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-muted",
                              issueIndex === activeIndex && "bg-muted",
                            )}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              onSelectNavItem({ type: "issue", issue: issuePreview });
                            }}
                          >
                            <CircleDot className="size-4 text-muted-foreground" />
                            <span className="font-mono text-xs text-muted-foreground">
                              #{issuePreview.number}
                            </span>
                            <span className="truncate">{issuePreview.title}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          align="end"
                          className="z-[2147483647] max-w-xs break-words whitespace-normal"
                        >
                          #{issuePreview.number} {issuePreview.title}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                    {prPreview ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            ref={(element) => {
                              onSetItemRef(prIndex, element);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-muted",
                              prIndex === activeIndex && "bg-muted",
                            )}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              onSelectNavItem({ type: "pr", pr: prPreview });
                            }}
                          >
                            <GitPullRequestArrow className="size-4 text-muted-foreground" />
                            <span className="font-mono text-xs text-muted-foreground">
                              #{prPreview.number}
                            </span>
                            <span className="truncate">{prPreview.title}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          align="end"
                          className="z-[2147483647] max-w-xs break-words whitespace-normal"
                        >
                          #{prPreview.number} {prPreview.title}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </>
                ) : null}
                {showAgentSessions && agentSessions ? (
                  <button
                    type="button"
                    ref={(element) => {
                      onSetItemRef(agentSessionsIndex, element);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-muted",
                      agentSessionsIndex === activeIndex && "bg-muted",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      agentSessions.onOpen();
                    }}
                  >
                    <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{t("mentionPopover.agentSessions")}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {t("mentionPopover.agentSessionsHint")}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                ) : null}
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground",
                    (githubItemCount > 0 || showAgentSessions) && "mt-1.5",
                  )}
                >
                  <Files className="size-3" />
                  <span>{t("mentionPopover.files")}</span>
                </div>
                {isLoading ? (
                  <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("mentionPopover.searchingFiles")}
                  </div>
                ) : mentionFiles.length > 0 ? (
                  mentionFiles.map((item, index) => {
                    const iconProps = getFileIconProps({
                      name: item.name,
                      isDir: item.isDir,
                      className: "size-4",
                    });
                    const navIndex = githubCount + index;
                    return (
                      <Tooltip key={item.relativePath}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            ref={(element) => {
                              onSetItemRef(navIndex, element);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-muted",
                              item.isHidden && "text-muted-foreground",
                              navIndex === activeIndex && "bg-muted",
                            )}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              onSelectFile(item);
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- file icons are tiny decorative SVG/data assets from the UI package. */}
                            <img {...iconProps} alt="" />
                            <MentionHighlightText
                              text={item.name}
                              query={nameHighlightQuery}
                              className="min-w-0 flex-1 truncate"
                            />
                            <span className="ml-2 max-w-[55%] shrink truncate text-right text-[11px] text-muted-foreground">
                              {item.relativePath}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          align="end"
                          className="z-[2147483647] max-w-xs break-words whitespace-normal"
                        >
                          {item.relativePath}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })
                ) : (
                  <div className="px-2.5 py-2 text-xs text-muted-foreground">
                    {isImmediateMentionListingQuery(popover.query)
                      ? t("mentionPopover.noFiles")
                      : t("mentionPopover.noMatches")}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          <div
            ref={sessionsPaneRef}
            className={cn(
              "w-full transition-all duration-200 ease-out",
              sessionsView
                ? "translate-x-0 opacity-100"
                : "pointer-events-none absolute inset-x-0 top-0 translate-x-3 opacity-0",
            )}
          >
            <div className="flex items-center gap-1 px-1 pt-1">
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("mentionPopover.back")}
                onMouseDown={(event) => {
                  event.preventDefault();
                  agentSessions?.onBack();
                }}
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-[11px] text-muted-foreground">
                {t("mentionPopover.recentSessions")}
              </span>
            </div>
            <ScrollArea
              scrollFade
              className="h-auto max-h-64 w-full"
              viewportClassName="h-auto max-h-64"
            >
              <div className="space-y-0.5 p-1">
                {agentSessions?.loading ? (
                  <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("mentionPopover.loadingSessions")}
                  </div>
                ) : agentSessions && agentSessions.sessions.length > 0 ? (
                  agentSessions.sessions.map((session, index) => {
                    const agent = mentionSessionAgentIcon(session.tool);
                    const status = getWorkspaceAgentGroupMeta(session.groupKey);
                    const StatusIcon = status.icon;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        ref={(element) => {
                          sessionItemRefs.current[index] = element;
                        }}
                        aria-label={`${session.title}, ${session.status}`}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-muted",
                          index === sessionActiveIndex && "bg-muted",
                        )}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSessionActiveIndex(index);
                          agentSessions.onSelect(session.id);
                        }}
                      >
                        <AgentIcon
                          registryId={agent.registryId}
                          name={agent.name}
                          size={16}
                          className="shrink-0"
                        />
                        <MentionHighlightText
                          text={session.title}
                          query={agentSessions.query}
                          className="min-w-0 flex-1 truncate"
                        />
                        <span title={session.status} className="inline-flex shrink-0">
                          <StatusIcon className={cn("size-3.5", status.className)} />
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-2.5 py-2 text-xs text-muted-foreground">
                    {agentSessions?.query.trim()
                      ? t("mentionPopover.noSessionMatches")
                      : t("mentionPopover.noSessions")}
                  </div>
                )}
                {agentSessions?.hasMore ? (
                  <button
                    type="button"
                    ref={(element) => {
                      sessionItemRefs.current[agentSessions.sessions.length] = element;
                    }}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                      sessionActiveIndex === agentSessions.sessions.length &&
                        "bg-muted text-foreground",
                    )}
                    disabled={agentSessions.loadingMore}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setSessionActiveIndex(agentSessions.sessions.length);
                      if (!agentSessions.loadingMore) agentSessions.onLoadMore();
                    }}
                  >
                    {agentSessions.loadingMore ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                    {t("mentionPopover.loadMoreSessions")}
                  </button>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
