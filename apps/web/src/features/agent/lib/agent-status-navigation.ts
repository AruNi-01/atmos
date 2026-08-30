"use client";

import { createTranslator } from "next-intl";
import {
  DEFAULT_CENTER_SPACE_ID,
  makeCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import {
  findWorkspacePaneIdsByTmuxWindowName,
  FIXED_TERMINAL_TAB_VALUE,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { spaceIdFromTmuxWindowName } from "@/features/terminal/store/terminal-store-helpers";
import {
  commitLocatedPaneNavigation,
  navigateToLocatedPane,
  waitForDestination,
  type NavigateToLocatedPaneRouter,
} from "@/features/terminal/public/navigate-to-located-pane";
import {
  buildAgentChatTabValue,
  useAgentChatCenterTabsStore,
} from "@/features/agent/store/use-agent-chat-center-tabs";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import type { Project } from "@/shared/types/domain";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

let cachedAgentLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedAgentTranslator: any = null;

function agentT(key: string): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedAgentTranslator || cachedAgentLocale !== locale) {
    cachedAgentLocale = locale;
    cachedAgentTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'Agent.chrome',
    });
  }
  return cachedAgentTranslator(key as never);
}

export type AgentStatusNavigationTarget = {
  contextId: string | null;
  /** Center space that owns the pane (`main` when the window is unprefixed). */
  spaceId: string;
  surface: "terminal" | "chat";
  chatId: string | null;
  isSideChat: boolean;
  sideChatId: string | null;
  tmuxWindowName: string | null;
};

export function chatStatusSessionId(chatId: string): string {
  return `chat:${chatId.trim()}`;
}

export function parseChatStatusSessionId(
  sessionId: string | null | undefined,
): string | null {
  const id = sessionId?.trim() ?? "";
  if (!id.startsWith("chat:")) return null;
  return id.slice("chat:".length) || null;
}

export function isAgentStatusSideChatSession(session: {
  side_chat_id?: string | null;
  terminal_kind?: string | null;
}): boolean {
  if (session.side_chat_id?.trim()) return true;
  return session.terminal_kind === "side_chat";
}

/** Prefer the source terminal/canvas pane for side chats; never the side tmux window. */
export function resolveAgentStatusNavigationTarget(session: {
  context_id?: string | null;
  pane_id?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  terminal_kind?: string | null;
  surface?: "terminal" | "chat" | null;
  surface_id?: string | null;
  space_id?: string | null;
  session_id?: string;
}): AgentStatusNavigationTarget {
  const chatId =
    session.surface === "chat"
      ? session.surface_id?.trim() ||
        session.session_id?.replace(/^chat:/, "").trim() ||
        null
      : null;
  if (chatId) {
    return {
      contextId: session.context_id?.trim() || null,
      spaceId: session.space_id?.trim() || DEFAULT_CENTER_SPACE_ID,
      surface: "chat",
      chatId,
      isSideChat: false,
      sideChatId: null,
      tmuxWindowName: null,
    };
  }
  const sideChatId = session.side_chat_id?.trim() || null;
  const isSideChat = isAgentStatusSideChatSession(session);
  const paneId = (
    isSideChat ? session.source_pane_id ?? session.pane_id : session.pane_id
  )?.trim() || null;
  const tmuxWindowName = paneId
    ? paneId.split(":").slice(1).join(":") || null
    : null;
  return {
    contextId: session.context_id?.trim() || null,
    spaceId: spaceIdFromTmuxWindowName(tmuxWindowName),
    surface: "terminal",
    chatId: null,
    isSideChat,
    sideChatId,
    tmuxWindowName,
  };
}

function currentHostIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id")?.trim() || null;
}

function routeKindForContext(
  contextId: string,
  projects: Project[],
): "project" | "workspace" {
  for (const project of projects) {
    if (project.id === contextId) return "project";
    if (project.workspaces.some((workspace) => workspace.id === contextId)) {
      return "workspace";
    }
  }
  return "workspace";
}

export function canNavigateToAgentStatusSession(session: {
  context_id?: string | null;
  pane_id?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  terminal_kind?: string | null;
  surface?: "terminal" | "chat" | null;
  surface_id?: string | null;
  space_id?: string | null;
  session_id?: string;
}): boolean {
  const target = resolveAgentStatusNavigationTarget(session);
  if (!target.contextId) return false;
  if (target.surface === "chat") return Boolean(target.chatId);
  return Boolean(target.tmuxWindowName || target.sideChatId);
}

export function buildAgentStatusSessionPath(
  session: AgentStatusRecord,
  projects: Project[],
  hit: { terminalTabId: string } | null,
): string | null {
  const target = resolveAgentStatusNavigationTarget(session);
  if (!target.contextId) return null;
  if (target.surface === "chat") {
    if (!target.chatId) return null;
    const basePath =
      routeKindForContext(target.contextId, projects) === "project"
        ? "/project"
        : "/workspace";
    const params = new URLSearchParams();
    params.set("id", target.contextId);
    params.set("tab", buildAgentChatTabValue(target.chatId));
    return `${basePath}?${params.toString()}`;
  }
  if (!target.tmuxWindowName && !target.sideChatId) {
    return null;
  }

  const basePath =
    routeKindForContext(target.contextId, projects) === "project"
      ? "/project"
      : "/workspace";

  const params = new URLSearchParams();
  params.set("id", target.contextId);
  if (hit?.terminalTabId) {
    params.set("tab", hit.terminalTabId);
  }
  if (target.tmuxWindowName) {
    params.set("terminalTmux", target.tmuxWindowName);
  }
  if (target.sideChatId) {
    params.set("sideChat", target.sideChatId);
  }
  return `${basePath}?${params.toString()}`;
}

async function prepareChatCenterTab(
  session: AgentStatusRecord,
  paintContextId: string,
  chatId: string,
) {
  const tabValue = buildAgentChatTabValue(chatId);
  useAgentChatCenterTabsStore.getState().openTab({
    contextId: paintContextId,
    chatId,
    providerId: session.provider_id ?? session.tool,
  });
  const { activateCenterChromeTab } = await import("@/app-shell/center-stage-activate");
  activateCenterChromeTab(paintContextId, tabValue, { attentionAck: "deferred" });
  return tabValue;
}

export function navigateToAgentStatusSession(
  session: AgentStatusRecord,
  router: NavigateToLocatedPaneRouter,
  projects: Project[],
) {
  const target = resolveAgentStatusNavigationTarget(session);
  const contextId = target.contextId;
  if (!contextId) return;

  const routeKind = routeKindForContext(contextId, projects);
  const paintContextId = makeCenterSpaceKey(contextId, target.spaceId);
  const state = useTerminalStore.getState();
  const hit = target.tmuxWindowName
    ? findWorkspacePaneIdsByTmuxWindowName(
        state,
        paintContextId,
        target.tmuxWindowName,
        routeKind === "project",
      )
    : null;
  const pane = hit
    ? state.getPanes(paintContextId, hit.terminalTabId)[hit.paneId]
    : undefined;

  const path = buildAgentStatusSessionPath(session, projects, hit);
  if (!path) return;

  void (async () => {
    if (target.surface === "chat" && target.chatId) {
      const tabValue = await prepareChatCenterTab(session, paintContextId, target.chatId);
      const { useCenterSpaceStore } = await import(
        "@/app-shell/center-space/center-space-store"
      );
      const store = useCenterSpaceStore.getState();
      if (!store.hydrated) store.hydrate();
      store.ensureHost(contextId);

      const sameHost = currentHostIdFromLocation() === contextId;
      const alreadyOnDestSpace =
        sameHost && store.getActiveSpaceId(contextId) === target.spaceId;

      if (!sameHost) {
        store.setActiveSpace(contextId, target.spaceId);
        commitLocatedPaneNavigation(router, path);
        return;
      }

      commitLocatedPaneNavigation(router, path);
      if (alreadyOnDestSpace) return;

      const committed = await waitForDestination({
        pathname: routeKind === "project" ? "/project" : "/workspace",
        id: contextId,
        tab: tabValue,
      });
      if (!committed) return;

      const { switchCenterSpace } = await import(
        "@/app-shell/center-space/center-space-switch"
      );
      await switchCenterSpace(contextId, target.spaceId, {
        preserveDeepLink: true,
      });
      return;
    }

    if (hit && pane?.sessionId && !target.sideChatId) {
      await navigateToLocatedPane(
        {
          hostId: contextId,
          spaceId: target.spaceId,
          paintContextId,
          terminalTabId: hit.terminalTabId,
          paneId: hit.paneId,
          sessionId: pane.sessionId,
          ...(target.tmuxWindowName ? { tmuxWindowName: target.tmuxWindowName } : {}),
        },
        { routeKind, router },
      );
      return;
    }

    const { useCenterSpaceStore } = await import(
      "@/app-shell/center-space/center-space-store"
    );
    const store = useCenterSpaceStore.getState();
    if (!store.hydrated) store.hydrate();
    store.ensureHost(contextId);

    const sameHost = currentHostIdFromLocation() === contextId;
    const alreadyOnDestSpace =
      sameHost && store.getActiveSpaceId(contextId) === target.spaceId;

    if (!sameHost) {
      store.setActiveSpace(contextId, target.spaceId);
      commitLocatedPaneNavigation(router, path);
      return;
    }

    commitLocatedPaneNavigation(router, path);
    if (alreadyOnDestSpace) return;

    const committed = await waitForDestination({
      pathname: routeKind === "project" ? "/project" : "/workspace",
      id: contextId,
      tab: hit?.terminalTabId || FIXED_TERMINAL_TAB_VALUE,
      ...(target.tmuxWindowName ? { terminalTmux: target.tmuxWindowName } : {}),
    });
    if (!committed) return;

    const { switchCenterSpace } = await import(
      "@/app-shell/center-space/center-space-switch"
    );
    await switchCenterSpace(contextId, target.spaceId, {
      preserveDeepLink: true,
    });
  })();
}

export function resolveAgentStatusContextNames(
  contextId: string | null | undefined,
  projectPath: string | null | undefined,
  projects: Project[],
): {
  projectName: string;
  workspaceName: string | null;
  workspaceDisplayName: string | null;
} {
  if (contextId) {
    for (const project of projects) {
      if (project.id === contextId) {
        return { projectName: project.name, workspaceName: null, workspaceDisplayName: null };
      }

      const ws = project.workspaces.find((w) => w.id === contextId);
      if (ws) {
        const workspaceName = ws.name || ws.branch;
        const workspaceDisplayName = ws.displayName?.trim() || null;
        return {
          projectName: project.name,
          workspaceName,
          workspaceDisplayName:
            workspaceDisplayName && workspaceDisplayName !== workspaceName
              ? workspaceDisplayName
              : null,
        };
      }
    }
  }

  if (projectPath) {
    const normalized = projectPath.replace(/[\\/]+$/, "");
    const projectName = normalized.split(/[\\/]/).pop() || projectPath;
    return { projectName, workspaceName: null, workspaceDisplayName: null };
  }

  if (contextId) {
    return { projectName: contextId.slice(0, 8), workspaceName: null, workspaceDisplayName: null };
  }

  return { projectName: agentT("agentHookNavigation.unknownProject"), workspaceName: null, workspaceDisplayName: null };
}
