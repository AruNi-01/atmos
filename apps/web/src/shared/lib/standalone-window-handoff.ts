"use client";

import { isTauriRuntime } from "./desktop-runtime";

type StandaloneSurfaceAction = "open" | "restore" | "close";

export interface StandaloneSurfaceEvent {
  key: string;
  action: StandaloneSurfaceAction;
  sourceId: string;
  at: number;
}

const CHANNEL_NAME = "atmos:standalone-window";
const STORAGE_PREFIX = "atmos:standalone-window:";
const SOURCE_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function canUseWindow(): boolean {
  return typeof window !== "undefined";
}

function createEvent(key: string, action: StandaloneSurfaceAction): StandaloneSurfaceEvent {
  return { key, action, sourceId: SOURCE_ID, at: Date.now() };
}

function publishEvent(event: StandaloneSurfaceEvent): void {
  if (!canUseWindow()) return;

  if (event.action === "open") {
    window.localStorage.setItem(storageKey(event.key), JSON.stringify(event));
  } else {
    window.localStorage.removeItem(storageKey(event.key));
  }

  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(event);
    channel.close();
  }
}

export function makeStandaloneSurfaceKey(
  surface: "preview" | "agent-chat",
  workspaceId?: string | null,
  projectId?: string | null,
): string {
  return [surface, workspaceId || "", projectId || ""].join(":");
}

export function isStandaloneSurfaceOpen(key: string): boolean {
  if (!canUseWindow()) return false;
  return window.localStorage.getItem(storageKey(key)) !== null;
}

export function markStandaloneSurfaceOpen(key: string): void {
  publishEvent(createEvent(key, "open"));
}

export function restoreStandaloneSurface(key: string): void {
  publishEvent(createEvent(key, "restore"));
}

export function closeStandaloneSurface(key: string): void {
  publishEvent(createEvent(key, "close"));
}

export function subscribeStandaloneSurface(
  key: string,
  handler: (isOpen: boolean, event: StandaloneSurfaceEvent | null) => void,
): () => void {
  if (!canUseWindow()) return () => {};

  const handleEvent = (event: StandaloneSurfaceEvent) => {
    if (event.key !== key || event.sourceId === SOURCE_ID) return;
    handler(event.action === "open", event);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== storageKey(key)) return;
    if (!event.newValue) {
      handler(false, null);
      return;
    }
    try {
      handleEvent(JSON.parse(event.newValue) as StandaloneSurfaceEvent);
    } catch {
      handler(true, null);
    }
  };

  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      handleEvent(event.data as StandaloneSurfaceEvent);
    });
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.close();
  };
}

export async function closeCurrentStandaloneWindow(): Promise<void> {
  if (isTauriRuntime()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
    return;
  }
  window.close();
}
