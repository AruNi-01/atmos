"use client";

import { defaultLocale, locales } from "@atmos/i18n/config";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";

type TauriInvoke = <T = unknown>(cmd: string, payload?: unknown) => Promise<T>;

export interface OpenAgentChatWindowOptions {
  agent?: string | null;
  session?: string | null;
  sessionCwd?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
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
    const invoke = await getInvoke();
    await invoke("open_agent_chat_window", {
      locale,
      agent: options.agent || null,
      session: options.session || null,
      sessionCwd: options.sessionCwd || null,
      workspaceId: options.workspaceId || null,
      projectId: options.projectId || null,
    });
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

function currentAppLocale(): string {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  const firstPathSegment = window.location.pathname
    .split("/")
    .filter(Boolean)[0];
  if (isLocaleSegment(firstPathSegment)) {
    return firstPathSegment;
  }

  const htmlLang = document.documentElement.lang;
  if (isLocaleSegment(htmlLang)) {
    return htmlLang;
  }

  return defaultLocale;
}

function isLocaleSegment(value: string | null | undefined): value is string {
  return !!value && locales.includes(value as (typeof locales)[number]);
}
