"use client";

import { createTranslator } from "next-intl";
import { toastManager } from "@workspace/ui";

import { currentAppLocale } from "@/shared/lib/current-app-locale";
import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

export interface OpenPreviewBrowserWindowOptions {
  url?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  /** Isolates each browser instance to its own Desktop window. */
  browserContextId?: string | null;
}

let cachedPreviewWindowLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPreviewWindowTranslator: any = null;

function previewWindowT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedPreviewWindowTranslator || cachedPreviewWindowLocale !== locale) {
    cachedPreviewWindowLocale = locale;
    cachedPreviewWindowTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "preview.toolbar.actions",
    });
  }
  return cachedPreviewWindowTranslator(key as never);
}

export async function openPreviewBrowserWindow(
  options: OpenPreviewBrowserWindowOptions = {},
): Promise<void> {
  if (!isDesktopRuntime()) return;

  try {
    await desktopInvoke("open_preview_browser_window", {
      locale: currentAppLocale(),
      url: options.url || null,
      workspace_id: options.workspaceId || null,
      workspaceId: options.workspaceId || null,
      project_id: options.projectId || null,
      projectId: options.projectId || null,
      browser_context_id: options.browserContextId || null,
      browserContextId: options.browserContextId || null,
    });
  } catch (error) {
    toastManager.add({
      title: previewWindowT("failedToOpenPreviewBrowserWindow"),
      description: error instanceof Error ? error.message : String(error),
      type: "error",
    });
    throw error;
  }
}
