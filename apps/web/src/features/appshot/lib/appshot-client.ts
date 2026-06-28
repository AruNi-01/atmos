"use client";

import { createTranslator } from "next-intl";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

import type {
  AppshotAcceptResponse,
  AppshotCopyResponse,
  AppshotOpenPermissionsRequest,
  AppshotPendingAutoAcceptRequest,
  AppshotPendingPreview,
  AppshotPermissionState,
  AppshotRecordDetail,
  AppshotRecordListItem,
  AppshotReadRecordsRequest,
  AppshotSettingsTarget,
  AppshotSnapshotView,
  AppshotStatus,
} from "../types";

type TauriInvoke = <T = unknown>(cmd: string, payload?: unknown) => Promise<T>;

const PREVIEW_EVENT = "appshot://preview";
let cachedAppshotLibLocale: "en" | "zh" | null = null;
let cachedAppshotLibTranslator: ReturnType<typeof createTranslator> | null = null;

function appshotLibT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedAppshotLibTranslator || cachedAppshotLibLocale !== locale) {
    cachedAppshotLibLocale = locale;
    cachedAppshotLibTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "appshot.lib",
    });
  }
  return cachedAppshotLibTranslator(key as never);
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

async function invokeAppshot<T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(appshotLibT("client.desktopOnly"));
  }

  const invoke = await getInvoke();
  return await invoke<T>(command, payload);
}

export function isAppshotRuntimeAvailable(): boolean {
  return isTauriRuntime();
}

export async function getAppshotStatus(): Promise<AppshotStatus> {
  if (!isTauriRuntime()) {
    return nonDesktopStatus();
  }

  return await invokeAppshot<AppshotStatus>("appshot_status");
}

export async function acceptAppshotPending(
  previewId: string,
): Promise<AppshotAcceptResponse> {
  return await invokeAppshot<AppshotAcceptResponse>("appshot_accept_pending", {
    previewId,
  });
}

export async function discardAppshotPending(previewId: string): Promise<void> {
  await invokeAppshot<void>("appshot_discard_pending", { previewId });
}

export async function setAppshotPendingAutoAccept(
  previewId: string,
  held: boolean,
  resumeInMs: number | null = null,
): Promise<void> {
  const req: AppshotPendingAutoAcceptRequest = {
    preview_id: previewId,
    held,
    resume_in_ms: resumeInMs,
  };
  await invokeAppshot<void>("appshot_set_pending_auto_accept", { req });
}

export async function listAppshotRecords(): Promise<AppshotRecordListItem[]> {
  if (!isTauriRuntime()) {
    return [];
  }

  return await invokeAppshot<AppshotRecordListItem[]>("appshot_list_records");
}

export async function readAppshotRecords(
  timestamps: string[],
): Promise<AppshotRecordDetail[]> {
  if (!isTauriRuntime() || timestamps.length === 0) {
    return [];
  }

  const req: AppshotReadRecordsRequest = { timestamps };
  return await invokeAppshot<AppshotRecordDetail[]>("appshot_read_records", {
    req,
  });
}

export async function readAppshotSnapshot(
  timestamp: string,
): Promise<AppshotSnapshotView> {
  return await invokeAppshot<AppshotSnapshotView>("appshot_read_snapshot", {
    timestamp,
  });
}

export async function copyAppshotRecord(
  timestamp: string,
): Promise<AppshotCopyResponse> {
  return await invokeAppshot<AppshotCopyResponse>("appshot_copy_record", {
    timestamp,
  });
}

export async function deleteAppshotRecord(timestamp: string): Promise<void> {
  await invokeAppshot<void>("appshot_delete_record", { timestamp });
}

export async function openAppshotPermissionTarget(
  target: AppshotSettingsTarget,
): Promise<void> {
  const req: AppshotOpenPermissionsRequest = { target };
  await invokeAppshot<void>("appshot_open_permissions", { req });
}

export async function showAppshotPermissionsWindow(
  locale = currentAppLocale(),
): Promise<void> {
  await invokeAppshot<void>("appshot_show_permissions_window", { locale });
}

export async function listenAppshotPreview(
  handler: (preview: AppshotPendingPreview) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<AppshotPendingPreview>(PREVIEW_EVENT, (event) => {
    if (event.payload) {
      handler(event.payload);
    }
  });

  return unlisten;
}

export function watchAppshotStatusAfterPermissionOpen(
  refreshStatus: () => Promise<unknown> | unknown,
  durationMs = 10_000,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let stopped = false;
  const startedAt = Date.now();
  const refresh = () => {
    if (!stopped) {
      void refreshStatus();
    }
  };
  const refreshUntilExpired = () => {
    if (Date.now() - startedAt <= durationMs) {
      refresh();
    }
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      refreshUntilExpired();
    }
  };

  window.addEventListener("focus", refreshUntilExpired);
  document.addEventListener("visibilitychange", onVisibilityChange);
  const intervalId = window.setInterval(refreshUntilExpired, 1_000);
  const initialTimeoutId = window.setTimeout(refresh, 750);
  const stopTimeoutId = window.setTimeout(() => {
    cleanup();
  }, durationMs);

  function cleanup() {
    if (stopped) {
      return;
    }
    stopped = true;
    window.removeEventListener("focus", refreshUntilExpired);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.clearInterval(intervalId);
    window.clearTimeout(initialTimeoutId);
    window.clearTimeout(stopTimeoutId);
  }

  return cleanup;
}

export function getDeniedAppshotPermissions(
  status: AppshotStatus | null,
): AppshotPermissionState[] {
  if (!status) {
    return [];
  }

  const byName = new Map<string, AppshotPermissionState>();
  for (const permission of [
    ...status.permissions,
    ...status.trigger.permissions,
  ]) {
    if (permission.granted) {
      continue;
    }
    byName.set(permission.name, permission);
  }
  return Array.from(byName.values());
}

function nonDesktopStatus(): AppshotStatus {
  return {
    supported: false,
    platform: "unknown",
    reason: appshotLibT("client.desktopRequired"),
    trigger: {
      mode: "unsupported",
      enabled: false,
      required_modifiers: [],
      last_error: null,
      permissions: [],
    },
    permissions: [],
  };
}
