"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillInfo } from "@/api/ws-api";
import type { AgentSessionStatusSnapshot } from "@atmos/api-types/ws/dto/agent-status";
import { wsRequest } from "@/api/ws/request";
import {
  AGENT_SESSION_MENTION_PAGE_SIZE,
  bridgeProviderId,
  sessionMatchesMentionQuery,
  type AgentSessionMentionTarget,
} from "@/features/agent/lib/agent-session-mention";
import { resolveAgentBridgeSkillRef } from "@/features/welcome/lib/slash-agent-bridge";
import type { ComposerHandle } from "@/features/welcome/components/PromptComposer";
import type {
  MentionAgentSessionRow,
  MentionAgentSessionsState,
  MentionNavItem,
  MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";

const SEARCH_PAGE_CAP = 10;

function isCurrentChat(session: AgentSessionStatusSnapshot, chatId: string | null): boolean {
  if (!chatId) return false;
  return session.session_id === chatId || session.surface_id === chatId;
}

function sessionRow(
  session: AgentSessionStatusSnapshot,
  statusLabel: (group: AgentSessionStatusSnapshot["group_key"]) => string,
): MentionAgentSessionRow | null {
  const tool = session.tool?.trim() || "";
  const provider = bridgeProviderId({ providerId: session.provider_id, tool: session.tool });
  const chatId =
    session.surface === "chat"
      ? session.surface_id?.trim() || session.session_id
      : session.session_id;
  if (!chatId) return null;
  const title = session.title?.trim() || tool || provider;
  return {
    id: session.session_id,
    provider,
    chatId,
    title,
    tool: tool || "agent",
    groupKey: session.group_key,
    status: statusLabel(session.group_key),
  };
}

/**
 * Shared `@` → Agent Sessions drill-in for the agent chat composer and the
 * terminal chat composer. The list endpoint has no title query, so a typed
 * `@` query filters titles on the client, and each page is 100 local sessions.
 */
export function useAgentSessionMentions({
  chatId = null,
  composerRef,
  enabled,
  mentionPopover,
  onCloseMention,
  skills,
}: {
  chatId?: string | null;
  composerRef: React.RefObject<ComposerHandle | null>;
  enabled: boolean;
  mentionPopover: MentionPopoverState;
  onCloseMention: () => void;
  skills: SkillInfo[];
}): {
  close: () => void;
  consumeNavItem: (item: MentionNavItem) => boolean;
  includeInNav: boolean;
  keyboardEnabled: boolean;
  state: MentionAgentSessionsState | null;
} {
  const t = useTranslations("Welcome.components");
  const statusLabel = React.useCallback(
    (group: AgentSessionStatusSnapshot["group_key"]) => t(`mentionPopover.sessionStatus.${group}`),
    [t],
  );
  const [view, setView] = React.useState<"menu" | "sessions">("menu");
  const [rows, setRows] = React.useState<MentionAgentSessionRow[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const generation = React.useRef(0);
  const pagesLoaded = React.useRef(0);
  const chatIdRef = React.useRef(chatId);
  chatIdRef.current = chatId;

  const close = React.useCallback(() => {
    setView("menu");
  }, []);

  React.useEffect(() => {
    if (!mentionPopover) close();
  }, [close, mentionPopover]);

  const appendPage = React.useCallback(
    async (cursor: string | null, append: boolean) => {
      const ticket = append ? generation.current : generation.current + 1;
      if (!append) {
        generation.current = ticket;
        pagesLoaded.current = 0;
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const response = await wsRequest("agent_session_status_list", {
          limit: AGENT_SESSION_MENTION_PAGE_SIZE,
          cursor,
        });
        if (ticket !== generation.current) return;
        const currentChatId = chatIdRef.current;
        const nextRows = (response.sessions ?? []).flatMap((session) => {
          if (isCurrentChat(session, currentChatId ?? null)) return [];
          const row = sessionRow(session, statusLabel);
          return row ? [row] : [];
        });
        setRows((current) => {
          const base = append ? current : [];
          const seen = new Set(base.map((row) => row.id));
          return [...base, ...nextRows.filter((row) => !seen.has(row.id))];
        });
        setNextCursor(response.next_cursor);
        pagesLoaded.current += 1;
      } catch {
        if (ticket !== generation.current) return;
        if (!append) setRows([]);
        setNextCursor(null);
      } finally {
        if (ticket === generation.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [statusLabel],
  );

  const open = React.useCallback(() => {
    setView("sessions");
    setRows([]);
    setNextCursor(null);
    void appendPage(null, false);
  }, [appendPage]);

  const loadMore = React.useCallback(() => {
    if (!nextCursor || loading || loadingMore) return;
    void appendPage(nextCursor, true);
  }, [appendPage, loading, loadingMore, nextCursor]);

  const query = mentionPopover?.query ?? "";
  const visibleRows = React.useMemo(
    () => rows.filter((row) => sessionMatchesMentionQuery(row, query)),
    [query, rows],
  );

  React.useEffect(() => {
    if (view !== "sessions" || !query.trim() || loading || loadingMore) return;
    if (visibleRows.length > 0 || !nextCursor) return;
    if (pagesLoaded.current >= SEARCH_PAGE_CAP) return;
    void appendPage(nextCursor, true);
  }, [appendPage, loading, loadingMore, nextCursor, query, view, visibleRows.length]);

  const select = React.useCallback(
    (id: string) => {
      const popover = mentionPopover;
      const row = rows.find((item) => item.id === id);
      if (!popover || !row) return;
      const skill = resolveAgentBridgeSkillRef(skills);
      if (skill.status === "disabled") {
        onCloseMention();
        close();
        return;
      }
      const target: AgentSessionMentionTarget = {
        provider: row.provider,
        chatId: row.chatId,
        title: row.title,
      };
      composerRef.current?.applyMentionAtRange(popover.atOffset, popover.query.length, {
        kind: "agent-sessions",
        skillPath: skill.absolutePath,
        targets: [target],
      });
      close();
      onCloseMention();
    },
    [close, composerRef, mentionPopover, onCloseMention, rows, skills],
  );

  const consumeNavItem = React.useCallback(
    (item: MentionNavItem) => {
      if (item.type !== "agent-sessions" || !enabled) return false;
      open();
      return true;
    },
    [enabled, open],
  );

  const state: MentionAgentSessionsState | null = enabled
    ? {
        view,
        loading,
        loadingMore,
        hasMore: Boolean(nextCursor),
        query,
        sessions: visibleRows,
        onOpen: open,
        onBack: close,
        onSelect: select,
        onLoadMore: loadMore,
      }
    : null;

  return {
    close,
    consumeNavItem,
    includeInNav: enabled && view === "menu",
    keyboardEnabled: view === "menu",
    state,
  };
}
