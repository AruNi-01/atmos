"use client";

import { createTranslator } from "next-intl";
import { toastManager } from "@workspace/ui";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type TauriInvoke = <T = unknown>(cmd: string, payload?: unknown) => Promise<T>;

export interface OpenAgentChatWindowOptions {
  agent?: string | null;
  session?: string | null;
  sessionCwd?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
}

let cachedAgentWindowLocale: 'en' | 'zh' | null = null;
let cachedAgentWindowTranslator: any = null;

function agentWindowT(key: string): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedAgentWindowTranslator || cachedAgentWindowLocale !== locale) {
    cachedAgentWindowLocale = locale;
    cachedAgentWindowTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'Agent.chrome',
    });
  }
  return cachedAgentWindowTranslator(key as never);
}

async function getInvoke(): Promise<TauriInvoke> {
  const internals = (window as {
    __TAURI_INTERNALS__?: {
      invoke?: TauriInvoke;
    };
  }).__TAURI_INTERNALS__;

  if (internals?.invoke) {
    return internals.invoke;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke as TauriInvoke;
}

export async function openAgentChatWindow(options: OpenAgentChatWindowOptions = {}): Promise<void> {
  const locale = currentAppLocale();
  if (isTauriRuntime()) {
    try {
      const invoke = await getInvoke();
      await invoke("open_agent_chat_window", {
        locale,
        agent: options.agent || null,
        session: options.session || null,
        sessionCwd: options.sessionCwd || null,
        workspaceId: options.workspaceId || null,
        projectId: options.projectId || null,
      });
    } catch (error) {
      toastManager.add({
        title: agentWindowT("desktopAgentChatWindow.failedToOpenChatWindow"),
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      throw error;
    }
    return;
  }

  window.open(buildBrowserAgentChatUrl(locale, options), "_blank", "noopener,noreferrer");
}

function buildBrowserAgentChatUrl(locale: string, options: OpenAgentChatWindowOptions): string {
  const params = new URLSearchParams();
  if (options.agent) params.set("agent", options.agent);
  if (options.session) params.set("session", options.session);
  if (options.sessionCwd) params.set("sessionCwd", options.sessionCwd);
  if (options.workspaceId) params.set("workspaceId", options.workspaceId);
  if (options.projectId) params.set("projectId", options.projectId);
  const query = params.toString();
  return `/${locale}/agent-chat/${query ? `?${query}` : ""}`;
}
