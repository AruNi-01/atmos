"use client";

import type { AgentPlan } from "@/features/agent/hooks/use-agent-session";
import type { ThreadEntry } from "@/features/agent/lib/agent/thread";
import type { PendingPermission } from "@/features/agent/lib/chat-helpers";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";

export interface AgentChatSessionHandoffSnapshot {
  version: 1;
  contextKey: string;
  registryId: string;
  runtimeSessionId: string | null;
  acpSessionId: string | null;
  sessionCwd: string | null;
  sessionTitle: string | null;
  sessionTitleSource: string | null;
  entries: ThreadEntry[];
  currentPlan: AgentPlan | null;
  pendingPermission: PendingPermission | null;
  waitingForResponse: boolean;
  isResumedSession: boolean;
  isAutoGeneratingTitle: boolean;
  shouldScrambleAutoTitle: boolean;
  truncated?: boolean;
  updatedAt: number;
}

interface AgentChatSessionHandoffEvent {
  contextKey: string;
  snapshot?: AgentChatSessionHandoffSnapshot;
  token?: string | null;
  sourceId: string;
  at: number;
}

type TauriInvoke = <T = unknown>(cmd: string, payload?: unknown) => Promise<T>;

const CHANNEL_NAME = "atmos:agent-chat-handoff";
const STORAGE_PREFIX = "atmos:agent-chat-handoff:";
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const SNAPSHOT_STORAGE_BUDGET_CHARS = 4_000_000;
const MIN_TRUNCATED_ENTRIES = 24;
const SOURCE_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function canUseWindow(): boolean {
  return typeof window !== "undefined";
}

function storageKey(contextKey: string): string {
  return `${STORAGE_PREFIX}${contextKey}`;
}

async function getInvoke(): Promise<TauriInvoke | null> {
  if (!canUseWindow() || !isTauriRuntime()) return null;

  const internals = (window as {
    __TAURI_INTERNALS__?: {
      invoke?: TauriInvoke;
    };
  }).__TAURI_INTERNALS__;
  if (internals?.invoke) return internals.invoke;

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke as TauriInvoke;
}

function snapshotIdentity(snapshot: AgentChatSessionHandoffSnapshot): string {
  return [
    snapshot.contextKey,
    snapshot.acpSessionId ?? "",
    snapshot.runtimeSessionId ?? "",
    String(snapshot.updatedAt),
  ].join(":");
}

export function getAgentChatSessionHandoffIdentity(
  snapshot: AgentChatSessionHandoffSnapshot,
): string {
  return snapshotIdentity(snapshot);
}

function isFreshSnapshot(snapshot: AgentChatSessionHandoffSnapshot): boolean {
  return Date.now() - snapshot.updatedAt <= SNAPSHOT_MAX_AGE_MS;
}

function normalizeSnapshot(
  value: unknown,
  contextKey: string,
  expectedAcpSessionId?: string | null,
): AgentChatSessionHandoffSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<AgentChatSessionHandoffSnapshot>;
  if (snapshot.version !== 1) return null;
  if (snapshot.contextKey !== contextKey) return null;
  if (expectedAcpSessionId && snapshot.acpSessionId !== expectedAcpSessionId) return null;
  if (typeof snapshot.updatedAt !== "number") return null;
  if (!isFreshSnapshot(snapshot as AgentChatSessionHandoffSnapshot)) return null;
  if (!Array.isArray(snapshot.entries)) return null;
  return snapshot as AgentChatSessionHandoffSnapshot;
}

function serializeWithinBudget(snapshot: AgentChatSessionHandoffSnapshot): string | null {
  try {
    const full = JSON.stringify(snapshot);
    if (full.length <= SNAPSHOT_STORAGE_BUDGET_CHARS) return full;

    let keep = snapshot.entries.length;
    while (keep > MIN_TRUNCATED_ENTRIES) {
      keep = Math.max(MIN_TRUNCATED_ENTRIES, Math.floor(keep * 0.75));
      const trimmed: AgentChatSessionHandoffSnapshot = {
        ...snapshot,
        entries: snapshot.entries.slice(-keep),
        truncated: true,
      };
      const serialized = JSON.stringify(trimmed);
      if (serialized.length <= SNAPSHOT_STORAGE_BUDGET_CHARS) return serialized;
    }
  } catch {
    return null;
  }

  return null;
}

function publishHandoffEvent(event: Omit<AgentChatSessionHandoffEvent, "sourceId" | "at">): void {
  if (!canUseWindow()) return;
  const payload: AgentChatSessionHandoffEvent = {
    ...event,
    sourceId: SOURCE_ID,
    at: Date.now(),
  };
  const BroadcastChannelCtor = (window as Window & {
    BroadcastChannel?: typeof BroadcastChannel;
  }).BroadcastChannel;
  if (BroadcastChannelCtor) {
    const channel = new BroadcastChannelCtor(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  }

  try {
    window.localStorage.setItem(storageKey(event.contextKey), JSON.stringify(payload));
  } catch {
    // Best-effort notification only.
  }
}

export async function writeAgentChatSessionHandoff(
  snapshot: AgentChatSessionHandoffSnapshot,
  token?: string | null,
): Promise<string | null> {
  if (!canUseWindow()) return null;

  if (isTauriRuntime()) {
    try {
      const invoke = await getInvoke();
      if (!invoke) return null;
      const nextToken = await invoke<string>("write_agent_chat_handoff", {
        token: token || null,
        snapshot,
      });
      publishHandoffEvent({
        contextKey: snapshot.contextKey,
        token: nextToken,
      });
      return nextToken;
    } catch {
      return null;
    }
  }

  const serialized = serializeWithinBudget(snapshot);
  if (!serialized) return null;

  try {
    window.localStorage.setItem(storageKey(snapshot.contextKey), serialized);
    publishHandoffEvent({
      contextKey: snapshot.contextKey,
      snapshot,
    });
    return null;
  } catch {
    return null;
  }
}

export async function readAgentChatSessionHandoff(
  contextKey: string,
  expectedAcpSessionId?: string | null,
  token?: string | null,
): Promise<AgentChatSessionHandoffSnapshot | null> {
  if (!canUseWindow()) return null;

  if (token && isTauriRuntime()) {
    try {
      const invoke = await getInvoke();
      if (!invoke) return null;
      const snapshot = await invoke<unknown | null>("read_agent_chat_handoff", { token });
      return normalizeSnapshot(snapshot, contextKey, expectedAcpSessionId);
    } catch {
      return null;
    }
  }

  const raw = window.localStorage.getItem(storageKey(contextKey));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AgentChatSessionHandoffSnapshot | AgentChatSessionHandoffEvent;
    if ("token" in parsed && parsed.token && isTauriRuntime()) {
      return readAgentChatSessionHandoff(contextKey, expectedAcpSessionId, parsed.token);
    }
    if ("snapshot" in parsed && parsed.snapshot) {
      return normalizeSnapshot(parsed.snapshot, contextKey, expectedAcpSessionId);
    }
    return normalizeSnapshot(parsed, contextKey, expectedAcpSessionId);
  } catch {
    return null;
  }
}

export function subscribeAgentChatSessionHandoff(
  contextKey: string,
  handler: (snapshot: AgentChatSessionHandoffSnapshot) => void,
): () => void {
  if (!canUseWindow()) return () => {};

  let channel: BroadcastChannel | null = null;
  const BroadcastChannelCtor = (window as Window & {
    BroadcastChannel?: typeof BroadcastChannel;
  }).BroadcastChannel;
  if (BroadcastChannelCtor) {
    channel = new BroadcastChannelCtor(CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      const data = event.data as AgentChatSessionHandoffEvent;
      if (data?.sourceId === SOURCE_ID) return;
      void resolveHandoffEvent(data, contextKey).then((snapshot) => {
        if (snapshot) handler(snapshot);
      });
    });
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== storageKey(contextKey) || !event.newValue) return;
    try {
      void resolveHandoffEvent(JSON.parse(event.newValue), contextKey).then((snapshot) => {
        if (snapshot) handler(snapshot);
      });
    } catch {
      // Ignore malformed handoff snapshots.
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.close();
  };
}

async function resolveHandoffEvent(
  value: unknown,
  contextKey: string,
): Promise<AgentChatSessionHandoffSnapshot | null> {
  if (!value || typeof value !== "object") return null;
  const event = value as AgentChatSessionHandoffEvent;
  if (event.contextKey !== contextKey) return null;
  if (event.snapshot) {
    return normalizeSnapshot(event.snapshot, contextKey);
  }
  if (event.token) {
    return readAgentChatSessionHandoff(contextKey, null, event.token);
  }
  return normalizeSnapshot(value, contextKey);
}
