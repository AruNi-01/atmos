"use client";

import { createTranslator } from "next-intl";
import { toastManager } from "@workspace/ui";

import { currentAppLocale } from "@/shared/lib/current-app-locale";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type TauriInvoke = <T = unknown>(cmd: string, payload?: unknown) => Promise<T>;

export interface OpenPreviewBrowserWindowOptions {
  url?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
}

let cachedPreviewWindowLocale: "en" | "zh" | null = null;
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

export async function openPreviewBrowserWindow(
  options: OpenPreviewBrowserWindowOptions = {},
): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    const invoke = await getInvoke();
    await invoke("open_preview_browser_window", {
      locale: currentAppLocale(),
      url: options.url || null,
      workspaceId: options.workspaceId || null,
      projectId: options.projectId || null,
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
