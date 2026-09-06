import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentChatFilterKey,
  agentChatInstanceKey,
  nextAgentLastSessionConfig,
  resolveRestoredAgentChat,
} from "@/features/agent/lib/agent-chat-last-session";
import { getSessionContextKey, legacySessionContextKey } from "@/features/agent/lib/chat-helpers";

describe("agent chat last session", () => {
  it("keys last session by context type so default and other modes stay separate", () => {
    expect(getSessionContextKey("ws-1", null, "default")).toBe("workspace:ws-1:default");
    expect(getSessionContextKey("ws-1", null, "wiki_ask")).toBe("workspace:ws-1:wiki_ask");
    expect(getSessionContextKey(null, "p-1", "default")).toBe("project:p-1:default");
    expect(legacySessionContextKey("ws-1", null)).toBe("workspace:ws-1");
    expect(agentChatFilterKey("ws-1", null, "default")).toBe("workspace:ws-1:default");
    expect(agentChatInstanceKey("ws-1", null, "default", "agent-chat:draft:1")).toBe(
      "workspace:ws-1:default:instance:agent-chat:draft:1",
    );
    expect(agentChatInstanceKey("ws-1", null, "default", null)).toBeNull();
    expect(agentChatInstanceKey(null, null, "default", "footer-modal")).toBe(
      "temp:default:instance:footer-modal",
    );
  });

  it("restores history for a surface without an instance, but not into a fresh draft tab", () => {
    const filterLast = {
      registryId: "claude",
      chatId: "chat-1",
      cwd: "/tmp",
      workspaceId: "ws-1",
      projectId: null,
      updatedAt: 1,
    };
    expect(
      resolveRestoredAgentChat({
        chatIdProp: "",
        instanceKey: null,
        instanceLast: null,
        filterLast,
        installedAgentIds: ["claude", "codex"],
        defaultRegistryId: "codex",
      }),
    ).toEqual({ chatId: "chat-1", registryId: "claude", modelId: "", thinkingId: "" });

    expect(
      resolveRestoredAgentChat({
        chatIdProp: "",
        instanceKey: "agent-chat:draft:new",
        instanceLast: null,
        filterLast,
        installedAgentIds: ["claude", "codex"],
        defaultRegistryId: "codex",
      }),
    ).toEqual({ chatId: "", registryId: "claude", modelId: "", thinkingId: "" });
  });

  it("prefers an explicit chat id and the instance's own last chat", () => {
    expect(
      resolveRestoredAgentChat({
        chatIdProp: "open-chat",
        instanceKey: "tab-1",
        instanceLast: {
          registryId: "codex",
          chatId: "tab-chat",
          cwd: null,
          workspaceId: "ws-1",
          projectId: null,
          updatedAt: 1,
        },
        filterLast: {
          registryId: "claude",
          chatId: "other-chat",
          cwd: null,
          workspaceId: "ws-1",
          projectId: null,
          updatedAt: 1,
        },
        installedAgentIds: ["claude", "codex"],
        defaultRegistryId: "claude",
      }),
    ).toEqual({ chatId: "open-chat", registryId: "codex", modelId: "", thinkingId: "" });

    expect(
      resolveRestoredAgentChat({
        chatIdProp: "",
        instanceKey: "tab-1",
        instanceLast: {
          registryId: "codex",
          chatId: "tab-chat",
          cwd: null,
          workspaceId: "ws-1",
          projectId: null,
          updatedAt: 1,
        },
        filterLast: {
          registryId: "claude",
          chatId: "other-chat",
          cwd: null,
          workspaceId: "ws-1",
          projectId: null,
          updatedAt: 1,
        },
        installedAgentIds: ["claude", "codex"],
        defaultRegistryId: "claude",
      }),
    ).toEqual({ chatId: "tab-chat", registryId: "codex", modelId: "", thinkingId: "" });
  });

  it("restores the last model and thinking for the remembered agent", () => {
    expect(
      resolveRestoredAgentChat({
        chatIdProp: "",
        instanceKey: "agent-chat:draft:new",
        instanceLast: null,
        filterLast: {
          registryId: "claude",
          chatId: "chat-1",
          cwd: "/tmp",
          workspaceId: "ws-1",
          projectId: null,
          updatedAt: 1,
          modelId: "opus",
          thinkingId: "high",
        },
        installedAgentIds: ["claude", "codex"],
        defaultRegistryId: "codex",
      }),
    ).toEqual({
      chatId: "",
      registryId: "claude",
      modelId: "opus",
      thinkingId: "high",
    });
  });

  it("keeps model and thinking when the same agent is persisted without them", () => {
    expect(
      nextAgentLastSessionConfig(
        {
          registryId: "claude",
          cwd: null,
          workspaceId: "ws-1",
          projectId: null,
          updatedAt: 1,
          modelId: "opus",
          thinkingId: "high",
        },
        { registryId: "claude" },
      ),
    ).toEqual({ modelId: "opus", thinkingId: "high" });
  });

  it("drops model and thinking when the agent changes", () => {
    expect(
      nextAgentLastSessionConfig(
        {
          registryId: "claude",
          cwd: null,
          workspaceId: "ws-1",
          projectId: null,
          updatedAt: 1,
          modelId: "opus",
          thinkingId: "high",
        },
        { registryId: "codex" },
      ),
    ).toEqual({ modelId: null, thinkingId: null });
  });

  it("hydrates stored history without resuming the provider on enter", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../hooks/use-agent-chat-session.ts"),
      "utf8",
    );
    expect(source).toContain("readAgentChatLastSessions");
    expect(source).toContain("resolveRestoredAgentChat");
    expect(source).toContain("prefsRestored");
    expect(source).toContain("connectionState === \"connected\"");
    expect(source).not.toContain("resumeSession(");
    expect(source).toContain("agentChatApi.get");
    expect(source).toContain("agentChatApi.send");
    expect(source).toContain("agentChatApi.prefsGet");
    expect(source).toContain("agentChatApi.prefsSet");
    expect(source).toContain("seedNewChatComposer");
    expect(source).toContain("rememberComposerOptions");
    expect(source).toContain("const [prefsRestored, setPrefsRestored] = useState(true)");
    expect(source).not.toContain("agentApi.listRegistry()");
    expect(source).not.toContain("setLoadingAgents(true)");
    expect(source).toContain("persistNewSessionPreferences");
    expect(source).toContain("ensureCreatedChat");
    expect(source).toContain("composerSelection");
    expect(source).toContain("composerConfigOptions");
    expect(source).toContain("displayedComposerConfigValue");
    expect(source).toContain("onUpdatedRef.current?.(id, { providerId: meta.provider_id ?? null })");
    expect(source).not.toContain("created.meta");
    expect(source).toContain("isRestoringTranscript: isResumingHistory");
    expect(source).toContain("resumeTranscript");
    expect(source).toContain("last_new_chat_configs");
    expect(source).toContain("lastNewChatConfigForAgent");
    expect(source).toContain("permission_mode: selected.permissionMode");
    expect(source).toContain("fast: selected.fast");
    expect(source).toContain("last_new_chat_config");
    expect(source).toContain("mergeLastNewChatConfigs");
    expect(source).toContain("keepComposerChrome");
    expect(source).not.toContain("agentApi.setDefaultConfig");
    expect(source).toContain("preferredConfigFromDefault");
    expect(source).toContain("from \"@/features/agent/lib/agent-chat-prefs\"");
    expect(source).not.toContain("restored.modelId");
    expect(source).not.toContain("restored.thinkingId");
  });
});
