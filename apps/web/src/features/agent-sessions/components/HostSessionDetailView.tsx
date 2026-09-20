"use client";

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  Button,
  cn,
  drawerCloseReserveClass,
  toastManager,
  useDrawerCloseReserve,
} from "@workspace/ui";
import { ChevronDown, Folder, Layers, Loader2, MessageSquare, SquareTerminal } from "lucide-react";
import { AgentMessageTimelineNav } from "@/features/agent/components/AgentMessageTimelineNav";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { useHostSessionPreview } from "@/features/agent-sessions/hooks/use-host-session-preview";
import { useHostSessionListQuery } from "@/features/agent-sessions/hooks/use-host-session-list-query";
import { useHostSessionSelection } from "@/features/agent-sessions/hooks/use-host-session-selection";
import { FindHighlightProvider, FindPanel, useFindPanel } from "@/features/editor/components/FindPanel";
import { TRANSCRIPT_FIND_SCOPE, type MarkdownFindQuery } from "@/features/editor/lib/markdown-find";
import { HostSessionTranscript } from "@/features/agent-sessions/components/HostSessionTranscript";
import {
  hasAtmosChatTag,
  hostSessionMessageIndex,
  hostSessionProjectLabel,
} from "@/features/agent-sessions/lib/host-session-filters";
import { formatHostSessionTuiLaunch } from "@/features/agent-sessions/lib/host-session-command";
import {
  hostSessionAgentIconId,
  hostSessionAgentLabel,
} from "@/features/agent-sessions/lib/host-session-groups";
import {
  resumeHostSessionInChat,
  resumeHostSessionInTui,
} from "@/features/agent-sessions/lib/host-session-resume";
import { fillHostSessionTurnTiming } from "@/features/agent-sessions/lib/host-session-timing";
import { currentPlanFromMessages } from "@/features/agent/lib/agent-chat-events";
import { parsePlan } from "@/features/agent/lib/agent-chat-thread";
import {
  resolveTranscriptFindScrollIndex,
  transcriptFindMessageIndexes,
  transcriptFindQuery,
} from "@/features/agent/lib/transcript-find";
import { AgentChatAboveComposerOverlays } from "@/features/agent/components/AgentChatAboveComposerOverlays";
import { SubagentConversationOverlay } from "@/features/agent/components/SubagentConversationOverlay";
import { SubagentOverlayProvider } from "@/features/agent/components/subagent-overlay-context";
import { grokChromeAgentIds } from "@/features/agent/lib/grok-chrome";
import {
  AGENT_CHAT_COMPOSER_FADE_CLASS,
  transcriptBottomPadPx,
} from "@/features/agent/lib/agent-chat-transcript-window";

function HostSessionResumeMenu({
  resumeChat,
  resumeTui,
  busy,
  onResumeChat,
  onResumeTui,
}: {
  resumeChat: boolean;
  resumeTui: boolean;
  busy: "chat" | "tui" | null;
  onResumeChat: () => void;
  onResumeTui: () => void;
}) {
  const t = useTranslations("agentSessions");
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabled = busy !== null || (!resumeChat && !resumeTui);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current == null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer, disabled]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  }, [clearCloseTimer]);

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const itemClassName =
    "relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

  return (
    <div
      className="relative"
      onPointerEnter={openMenu}
      onPointerLeave={scheduleClose}
    >
      <Button
        type="button"
        size="sm"
        variant="default"
        disabled={disabled}
        aria-label={t("resume")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={openMenu}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
        {t("resume")}
        <ChevronDown className="size-3.5 opacity-80" />
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label={t("resume")}
          className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!resumeChat || busy !== null}
            className={itemClassName}
            onClick={() => {
              setOpen(false);
              onResumeChat();
            }}
          >
            <MessageSquare />
            {t("resumeChat")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!resumeTui || busy !== null}
            className={itemClassName}
            onClick={() => {
              setOpen(false);
              onResumeTui();
            }}
          >
            <SquareTerminal />
            {t("resumeTui")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function HostSessionDetailView({
  selectedKey,
}: {
  selectedKey: string;
}) {
  const t = useTranslations("agentSessions");
  const reserveClose = useDrawerCloseReserve();
  const router = useAppRouter();
  const projects = useProjects();
  const { messageId, seq } = useHostSessionSelection();
  const { listQuery } = useHostSessionListQuery();
  const { preview, isLoading, error } = useHostSessionPreview(selectedKey);
  const [resumeBusy, setResumeBusy] = useState<"chat" | "tui" | null>(null);
  const [tuiCommand, setTuiCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null);
  const [messageNavIndex, setMessageNavIndex] = useState(-1);
  const [findSeed, setFindSeed] = useState("");
  const [findQuery, setFindQuery] = useState<MarkdownFindQuery>(transcriptFindQuery(""));
  const [findRoot, setFindRoot] = useState<HTMLElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const composerSurfaceRef = useRef<HTMLDivElement | null>(null);
  const scrollToIndexRef = useRef<((index: number) => void) | null>(null);
  const timelineNavLockedRef = useRef(false);
  const [aboveComposerOverlaysNode, setAboveComposerOverlaysNode] =
    useState<HTMLDivElement | null>(null);
  const [aboveComposerOverlayPadPx, setAboveComposerOverlayPadPx] = useState(0);
  const reduceOverlayPadMotion = Boolean(useReducedMotion());

  const session = preview?.session ?? null;
  const messages = useMemo(
    () => fillHostSessionTurnTiming(preview?.messages ?? [], preview?.session?.updated_at),
    [preview?.messages, preview?.session?.updated_at],
  );
  const grokGoal = preview?.grok_goal ?? null;
  const grokWorkflow = preview?.grok_workflow ?? null;
  const currentPlan = useMemo(
    () => parsePlan(currentPlanFromMessages(messages)),
    [messages],
  );
  const grokChromeIds = useMemo(
    () => grokChromeAgentIds(grokGoal, grokWorkflow),
    [grokGoal, grokWorkflow],
  );
  const userMessageIndices = useMemo(
    () =>
      messages
        .map((message, index) => (message.role === "user" ? index : -1))
        .filter((index) => index >= 0),
    [messages],
  );
  const showTimelineNav = userMessageIndices.length > 1;
  const { open: findOpen, setOpen: setFindOpen, focusNonce: findFocusNonce } = useFindPanel(
    messages.length > 0,
  );
  const handleFindQueryChange = useCallback((query: MarkdownFindQuery) => {
    setFindQuery(query);
  }, []);
  const seedHits = useMemo(
    () => transcriptFindMessageIndexes(messages, findSeed),
    [findSeed, messages],
  );
  const keepMessageIndexes = useMemo(
    () => (findOpen
      ? transcriptFindMessageIndexes(messages, findQuery.search.trim() ? findQuery : findSeed)
      : []),
    [findOpen, findQuery, findSeed, messages],
  );
  const locatorIndex = hostSessionMessageIndex(messages, { messageId, seq });
  const initialScrollIndex = useMemo(
    () => resolveTranscriptFindScrollIndex(seedHits, locatorIndex),
    [locatorIndex, seedHits],
  );

  const listQueryRef = useRef(listQuery);
  listQueryRef.current = listQuery;

  React.useEffect(() => {
    setTuiCommand(null);
    setCopied(false);
    setSelectedSubagentId(null);
    setMessageNavIndex(-1);
    timelineNavLockedRef.current = false;
    const seed = listQueryRef.current.trim();
    setFindSeed(seed);
    setFindQuery(transcriptFindQuery(seed));
    setFindOpen(Boolean(seed));
  }, [selectedKey, setFindOpen]);

  React.useEffect(() => {
    if (!messages.length) return;
    const index = initialScrollIndex;
    if (index == null) return;
    let tries = 0;
    const jump = () => {
      const scrollTo = scrollToIndexRef.current;
      if (scrollTo) {
        timelineNavLockedRef.current = true;
        scrollTo(index);
        setMessageNavIndex(index);
        return;
      }
      if (tries < 20) {
        tries += 1;
        requestAnimationFrame(jump);
      }
    };
    jump();
  }, [initialScrollIndex, messages.length, selectedKey]);

  React.useEffect(() => {
    const host = transcriptRef.current;
    setFindRoot(host?.querySelector<HTMLElement>(".agent-chat-scroll") ?? host);
  }, [messages.length, selectedKey]);

  const handleSelectTimelineMessage = useCallback((messageIndex: number) => {
    if (!userMessageIndices.includes(messageIndex)) return;
    timelineNavLockedRef.current = true;
    scrollToIndexRef.current?.(messageIndex);
    setMessageNavIndex(messageIndex);
  }, [userMessageIndices]);

  const handleActiveTimelineMessage = useCallback((index: number) => {
    if (timelineNavLockedRef.current) return;
    setMessageNavIndex(index);
  }, []);

  const releaseTimelineNavLock = useCallback(() => {
    timelineNavLockedRef.current = false;
  }, []);

  useLayoutEffect(() => {
    if (!aboveComposerOverlaysNode) {
      setAboveComposerOverlayPadPx(0);
      return;
    }
    const measure = () => {
      const next = Math.max(0, Math.round(aboveComposerOverlaysNode.getBoundingClientRect().height));
      setAboveComposerOverlayPadPx((current) => (current === next ? current : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(aboveComposerOverlaysNode);
    return () => observer.disconnect();
  }, [aboveComposerOverlaysNode]);

  const handleResumeChat = useCallback(async () => {
    setResumeBusy("chat");
    try {
      await resumeHostSessionInChat(selectedKey, router, projects);
    } catch (err) {
      toastManager.add({
        title: t("resumeChatFailed"),
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      setResumeBusy(null);
    }
  }, [projects, router, selectedKey, t]);

  const handleResumeTui = useCallback(async () => {
    if (!session) return;
    setResumeBusy("tui");
    setCopied(false);
    try {
      const { result, launched } = await resumeHostSessionInTui(
        selectedKey,
        router,
        projects,
        { provider_id: session.provider_id, title: session.title },
      );
      if (launched) {
        setTuiCommand(null);
        return;
      }
      setTuiCommand(formatHostSessionTuiLaunch(result));
    } catch (err) {
      toastManager.add({
        title: t("resumeTuiFailed"),
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      setResumeBusy(null);
    }
  }, [projects, router, selectedKey, session, t]);

  const handleCopyCommand = useCallback(async () => {
    if (!tuiCommand) return;
    try {
      await navigator.clipboard.writeText(tuiCommand);
      setCopied(true);
    } catch (err) {
      toastManager.add({
        title: t("copyFailed"),
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    }
  }, [t, tuiCommand]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="host-session-center">
      <header
        className={cn(
          "flex shrink-0 items-start justify-between gap-3 bg-background/80 px-5 py-3",
          reserveClose && drawerCloseReserveClass,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/30">
            {session ? (
              <AgentIcon
                registryId={hostSessionAgentIconId(session.provider_id)}
                name={hostSessionAgentLabel(session.provider_id)}
                size={16}
              />
            ) : (
              <Layers className="size-4 text-muted-foreground" />
            )}
          </div>
          {isLoading && !preview ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{t("loadingTranscript")}</span>
            </div>
          ) : error || !session ? (
            <p className="text-sm text-muted-foreground">{t("previewError")}</p>
          ) : (
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-base font-semibold text-foreground">
                  {session.title.trim() || session.native_id}
                </h1>
                {hasAtmosChatTag(session) ? (
                  <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t("atmosChatTag")}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                <AgentIcon
                  registryId={hostSessionAgentIconId(session.provider_id)}
                  name={hostSessionAgentLabel(session.provider_id)}
                  size={12}
                />
                <span className="truncate">{hostSessionAgentLabel(session.provider_id)}</span>
                <span className="text-border">·</span>
                <Folder className="size-3 shrink-0" />
                <span className="truncate">
                  {hostSessionProjectLabel(session) || session.cwd}
                </span>
              </p>
            </div>
          )}
        </div>
        {session ? (
          <HostSessionResumeMenu
            resumeChat={session.resume_chat === "supported"}
            resumeTui={session.resume_tui === "supported"}
            busy={resumeBusy}
            onResumeChat={() => void handleResumeChat()}
            onResumeTui={() => void handleResumeTui()}
          />
        ) : null}
      </header>

      {tuiCommand ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-6 py-2 text-xs">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{t("tuiCommand")}</p>
            <p className="truncate font-mono text-muted-foreground">{tuiCommand}</p>
            <p className="truncate text-muted-foreground">{t("resumeTuiNoWorkspace")}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => void handleCopyCommand()}>
            {copied ? t("copied") : t("copyCommand")}
          </Button>
        </div>
      ) : null}

      {!session ? (
        <div className="min-h-0 flex-1" />
      ) : (
        <SubagentOverlayProvider
          selectedId={selectedSubagentId}
          onSelect={setSelectedSubagentId}
        >
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden [container-type:size] [container-name:agent-chat]"
            data-agent-chat-column=""
          >
            <div
              className={cn(
                "mx-auto flex min-h-0 w-full flex-1 pr-1",
                showTimelineNav ? "max-w-[calc(48rem+2rem)]" : "max-w-3xl",
              )}
            >
              {showTimelineNav ? (
                <div
                  data-agent-chat-timeline-nav=""
                  className="relative w-8 shrink-0"
                >
                  <AgentMessageTimelineNav
                    activeAgent={{
                      id: hostSessionAgentIconId(session.provider_id),
                      name: hostSessionAgentLabel(session.provider_id),
                    }}
                    messages={messages}
                    userMessageIndices={userMessageIndices}
                    activeMessageIndex={messageNavIndex}
                    onSelectMessage={handleSelectTimelineMessage}
                  />
                </div>
              ) : null}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              ref={transcriptRef}
              className="relative min-h-0 flex-1 overflow-hidden"
            >
              <FindHighlightProvider>
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {t("emptyTranscript")}
                </div>
              ) : (
                <HostSessionTranscript
                  key={session.key}
                  messages={messages}
                  cwd={session.cwd}
                  registryId={session.provider_id}
                  transcriptRef={transcriptRef}
                  overlayHost={aboveComposerOverlaysNode}
                  overlayPadPx={transcriptBottomPadPx(aboveComposerOverlayPadPx)}
                  overlayPadShrinking={false}
                  reduceOverlayPadMotion={reduceOverlayPadMotion}
                  subagentCardMode="transcript"
                  excludeSubagentIds={grokChromeIds}
                  userMessageIndices={userMessageIndices}
                  onActiveUserMessage={handleActiveTimelineMessage}
                  onUserScrollIntent={releaseTimelineNavLock}
                  scrollToIndexRef={scrollToIndexRef}
                  keepMessageIndexes={keepMessageIndexes}
                  initialScrollIndex={initialScrollIndex}
                />
              )}
              {messages.length > 0 ? (
                <FindPanel
                  open={findOpen}
                  root={findRoot}
                  seed={findSeed}
                  resetKey={selectedKey}
                  focusNonce={findFocusNonce}
                  scopeSelector={TRANSCRIPT_FIND_SCOPE}
                  onQueryChange={handleFindQueryChange}
                  onClose={() => setFindOpen(false)}
                />
              ) : null}
              {messages.length > 0 ? (
                <div
                  data-agent-chat-composer-fade=""
                  aria-hidden="true"
                  className={AGENT_CHAT_COMPOSER_FADE_CLASS}
                />
              ) : null}
              </FindHighlightProvider>
            </div>
            <div
              className="relative z-10 mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 pt-px"
              data-agent-chat-composer=""
              onKeyDownCapture={(event) => {
                if (event.key !== "Escape") return;
                if (findOpen) return;
                if (!selectedSubagentId) return;
                event.preventDefault();
                setSelectedSubagentId(null);
              }}
            >
              <div ref={composerSurfaceRef} className="relative">
                <AgentChatAboveComposerOverlays
                  composerSurfaceRef={composerSurfaceRef}
                  messages={messages}
                  grokGoal={grokGoal}
                  grokWorkflow={grokWorkflow}
                  currentPlan={currentPlan}
                  subagentTasks={{ items: [], tools: [] }}
                  grokCardsDefaultOpen={false}
                  subagentOverlay={
                    selectedSubagentId ? (
                      <SubagentConversationOverlay
                        messages={messages}
                        toolCallId={selectedSubagentId}
                        cwd={session.cwd}
                        onClose={() => setSelectedSubagentId(null)}
                      />
                    ) : null
                  }
                  onLaneNodeChange={setAboveComposerOverlaysNode}
                />
              </div>
            </div>
              </div>
            </div>
          </div>
        </SubagentOverlayProvider>
      )}
    </div>
  );
}
