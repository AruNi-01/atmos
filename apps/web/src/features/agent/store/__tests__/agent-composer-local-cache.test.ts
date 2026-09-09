import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { AgentOptionsSnapshot } from "@/api/ws/agent-chat-api";
import {
  COMPOSER_LOCAL_CACHE_KEY,
  __resetComposerLocalCacheForTests,
  composerOptionsAreUsable,
  shouldRetainExistingOptions,
  readComposerLocalCache,
  rememberComposerChromeDraft,
  rememberComposerOptions,
  rememberLastNewChatConfigs,
  rememberLastRegistryId,
  seedNewChatComposer,
} from "@/features/agent/store/agent-composer-local-cache";

const mem = new Map<string, string>();

function cursorCatalog(): AgentOptionsSnapshot {
  return {
    agent_id: "cursor",
    status: "ok",
    models: [{ id: "composer-2.5", label: "Composer 2.5", is_default: true }],
    modes: [
      { id: "agent", label: "Agent", is_default: true },
      { id: "plan", label: "Plan" },
      { id: "ask", label: "Ask" },
    ],
    thinking: { type: "none" },
    strategies_used: [],
    fetched_at: "2026-09-06T00:00:00.000Z",
    source: "cache",
    message: null,
  };
}

beforeEach(() => {
  mem.clear();
  __resetComposerLocalCacheForTests();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
      removeItem: (key: string) => {
        mem.delete(key);
      },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
});

afterEach(() => {
  __resetComposerLocalCacheForTests();
  mem.clear();
});

describe("composer local cache", () => {
  it("skips probing snapshots with no models or modes", () => {
    expect(
      composerOptionsAreUsable({
        agent_id: "cursor",
        status: "probing",
        models: [],
        modes: [],
        thinking: { type: "none" },
        strategies_used: [],
        fetched_at: "",
        source: "live",
        message: null,
      }),
    ).toBe(false);
    rememberComposerOptions({
      agent_id: "cursor",
      status: "probing",
      models: [],
      modes: [],
      thinking: { type: "none" },
      strategies_used: [],
      fetched_at: "",
      source: "live",
      message: null,
    });
    expect(readComposerLocalCache().optionsByAgent.cursor).toBeUndefined();
  });

  it("keeps last-good options when a later probe is empty error", () => {
    rememberComposerOptions(cursorCatalog());
    const incoming: AgentOptionsSnapshot = {
      agent_id: "cursor",
      status: "error",
      models: [],
      modes: [],
      thinking: { type: "none" },
      strategies_used: [],
      fetched_at: "",
      source: "live",
      message: "temp ACP catalog probe timed out",
    };
    expect(shouldRetainExistingOptions(incoming, cursorCatalog())).toBe(true);
    rememberComposerOptions(incoming);
    expect(readComposerLocalCache().optionsByAgent.cursor?.models[0]?.id).toBe("composer-2.5");
  });

  it("keeps last-good options when a later probe is auth required", () => {
    rememberComposerOptions(cursorCatalog());
    const incoming: AgentOptionsSnapshot = {
      agent_id: "cursor",
      status: "auth_required",
      models: [],
      modes: [],
      thinking: { type: "none" },
      strategies_used: [],
      fetched_at: "",
      source: "live",
      message: "ACP_AUTH_REQUIRED::{}",
    };
    expect(shouldRetainExistingOptions(incoming, cursorCatalog())).toBe(true);
    rememberComposerOptions(incoming);
    expect(readComposerLocalCache().optionsByAgent.cursor?.models[0]?.id).toBe("composer-2.5");
  });

  it("keeps last-good for any agent when a later ok probe drops commands", () => {
    const existing: AgentOptionsSnapshot = {
      agent_id: "grok",
      status: "ok",
      models: [{ id: "grok-4.6", label: "Grok 4.6", is_default: true }],
      modes: [{ id: "default", label: "Default", is_default: true }],
      commands: [{ name: "10x", description: "audit" }],
      thinking: { type: "none" },
      strategies_used: [],
      fetched_at: "2026-09-06T00:00:00.000Z",
      source: "cache",
      message: null,
    };
    const incoming: AgentOptionsSnapshot = {
      ...existing,
      source: "live",
      modes: [],
      commands: [],
    };
    expect(shouldRetainExistingOptions(incoming, existing)).toBe(true);
    expect(
      shouldRetainExistingOptions(
        { ...existing, models: [{ id: "grok-4.6", label: "Grok 4.6", is_default: true }] },
        existing,
      ),
    ).toBe(false);
  });

  it("persists last registry, new-chat configs, and usable options", () => {
    rememberLastRegistryId("cursor");
    rememberLastNewChatConfigs({
      cursor: { model: "composer-2.5", mode: "agent", fast: "true" },
    });
    rememberComposerOptions(cursorCatalog());
    __resetComposerLocalCacheForTests();
    expect(mem.get(COMPOSER_LOCAL_CACHE_KEY)).toBeTruthy();
    const cached = readComposerLocalCache();
    expect(cached.lastRegistryId).toBe("cursor");
    expect(cached.lastNewChatConfigs.cursor).toEqual({
      model: "composer-2.5",
      mode: "agent",
      fast: "true",
    });
    expect(cached.optionsByAgent.cursor?.models[0]?.id).toBe("composer-2.5");
    expect(cached.optionsByAgent.cursor?.modes.map((mode) => mode.id)).toEqual([
      "agent",
      "plan",
      "ask",
    ]);
  });

  it("seeds a new chat as hydrated from the local cache", () => {
    rememberLastRegistryId("cursor");
    rememberLastNewChatConfigs({
      cursor: { model: "composer-2.5", mode: "agent" },
    });
    rememberComposerOptions(cursorCatalog());
    const seed = seedNewChatComposer({
      chatId: "",
      instanceKey: "agent-chat:draft:1",
      isolatedModal: false,
      urlWorkspaceId: "ws-1",
      urlProjectId: null,
      chatMode: "default",
    });
    expect(seed.hydrated).toBe(true);
    expect(seed.providerId).toBe("cursor");
    expect(seed.preferred.modelId).toBe("composer-2.5");
    expect(seed.preferred.modeId).toBe("agent");
    expect(seed.catalog?.modes.some((mode) => mode.id === "agent")).toBe(true);
  });

  it("restores per-instance composer chrome ahead of last-agent snapshots", () => {
    rememberLastRegistryId("cursor");
    rememberLastNewChatConfigs({
      cursor: { model: "composer-2.5", mode: "agent" },
    });
    rememberComposerChromeDraft("agent-chat:draft:1", {
      providerId: "cursor",
      model: "composer-2.5",
      thinking: "",
      mode: "plan",
      permissionMode: "default",
      fast: "",
      context: "272k",
    });
    const seed = seedNewChatComposer({
      chatId: "",
      instanceKey: "agent-chat:draft:1",
      isolatedModal: false,
      urlWorkspaceId: "ws-1",
      urlProjectId: null,
      chatMode: "default",
    });
    expect(seed.preferred.modeId).toBe("plan");
    expect(seed.preferred.permissionModeId).toBe("default");
    expect(seed.preferred.modelId).toBe("composer-2.5");
    expect(seed.preferred.contextId).toBe("272k");
  });

  it("keeps existing chats waiting for transcript hydrate", () => {
    const seed = seedNewChatComposer({
      chatId: "chat-1",
      instanceKey: "agent-chat:chat-1",
      isolatedModal: false,
      urlWorkspaceId: "ws-1",
      urlProjectId: null,
      chatMode: "default",
    });
    expect(seed.hydrated).toBe(false);
  });
});
