import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentChatFilterKey,
  agentChatInstanceKey,
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
    ).toEqual({ chatId: "chat-1", registryId: "claude" });

    expect(
      resolveRestoredAgentChat({
        chatIdProp: "",
        instanceKey: "agent-chat:draft:new",
        instanceLast: null,
        filterLast,
        installedAgentIds: ["claude", "codex"],
        defaultRegistryId: "codex",
      }),
    ).toEqual({ chatId: "", registryId: "claude" });
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
    ).toEqual({ chatId: "open-chat", registryId: "codex" });

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
    ).toEqual({ chatId: "tab-chat", registryId: "codex" });
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
  });
});
