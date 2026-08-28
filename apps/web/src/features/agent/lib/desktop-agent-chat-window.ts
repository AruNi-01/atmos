"use client";

import { createTranslator } from "next-intl";
import { toastManager } from "@workspace/ui";
import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

export interface OpenAgentChatWindowOptions {
  agent?: string | null;
  conversationId?: string | null;
  sessionCwd?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  instanceKey?: string | null;
  handoffToken?: string | null;
}

let cachedAgentWindowLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedAgentWindowTranslator: any = null;

function agentWindowT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedAgentWindowTranslator || cachedAgentWindowLocale !== locale) {
    cachedAgentWindowLocale = locale;
    cachedAgentWindowTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "Agent.chrome",
    });
  }
  return cachedAgentWindowTranslator(key as never);
}

export async function openAgentChatWindow(
  options: OpenAgentChatWindowOptions = {},
): Promise<void> {
  const locale = currentAppLocale();
  if (isDesktopRuntime()) {
    try {
      await desktopInvoke("open_agent_chat_window", {
        locale,
        agent: options.agent || null,
        conversation_id: options.conversationId || null,
        conversationId: options.conversationId || null,
        session_cwd: options.sessionCwd || null,
        sessionCwd: options.sessionCwd || null,
        workspace_id: options.workspaceId || null,
        workspaceId: options.workspaceId || null,
        project_id: options.projectId || null,
        projectId: options.projectId || null,
        instance_key: options.instanceKey || null,
        instanceKey: options.instanceKey || null,
        handoff_token: options.handoffToken || null,
        handoffToken: options.handoffToken || null,
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

  window.open(
    buildBrowserAgentChatUrl(options),
    "_blank",
    "noopener,noreferrer",
  );
}

function buildBrowserAgentChatUrl(options: OpenAgentChatWindowOptions): string {
  const params = new URLSearchParams();
  if (options.agent) params.set("agent", options.agent);
  if (options.conversationId) params.set("conversationId", options.conversationId);
  if (options.sessionCwd) params.set("sessionCwd", options.sessionCwd);
  if (options.workspaceId) params.set("workspaceId", options.workspaceId);
  if (options.projectId) params.set("projectId", options.projectId);
  if (options.instanceKey) params.set("instanceKey", options.instanceKey);
  if (options.handoffToken) params.set("handoffToken", options.handoffToken);
  const query = params.toString();
  return `/agent-chat/${query ? `?${query}` : ""}`;
}
