import { beforeEach, describe, expect, it } from "bun:test";
import {
  normalizeAgentChatCenterTab,
  useAgentChatCenterTabsStore,
} from "./use-agent-chat-center-tabs";

describe("agent chat center tabs", () => {
  beforeEach(() => {
    useAgentChatCenterTabsStore.setState({ tabsByContext: {}, pendingActivate: null, pendingNewChat: 0 });
  });

  it("treats persisted tabs with a chat id as having messages", () => {
    expect(
      normalizeAgentChatCenterTab({
        id: "agent-chat:old",
        value: "agent-chat:old",
        contextId: "ws-1",
        chatId: "conv-1",
        title: "Chat",
        cwd: "",
        providerId: "claude",
        openedAt: 1,
      }).hasMessages,
    ).toBe(true);
    expect(
      normalizeAgentChatCenterTab({
        id: "agent-chat:draft:1",
        value: "agent-chat:draft:1",
        contextId: "ws-1",
        chatId: null,
        title: "Chat",
        cwd: "",
        providerId: null,
        openedAt: 1,
      }).hasMessages,
    ).toBe(false);
  });

  it("opens a draft tab without a chat id", () => {
    const tab = useAgentChatCenterTabsStore.getState().openDraftTab({
      contextId: "ws-1",
      title: "New chat",
    });
    expect(tab.chatId).toBeNull();
    expect(tab.hasMessages).toBe(false);
    expect(tab.value.startsWith("agent-chat:draft:")).toBe(true);
    expect(useAgentChatCenterTabsStore.getState().tabsByContext["ws-1"]).toHaveLength(1);
  });

  it("binds a chat to the same tab after the first send", () => {
    const tab = useAgentChatCenterTabsStore.getState().openDraftTab({ contextId: "ws-1" });
    expect(tab.title).toBe("Chat");
    expect(tab.providerId).toBeNull();
    useAgentChatCenterTabsStore.getState().bindChat({
      contextId: "ws-1",
      value: tab.value,
      chatId: "conv-1",
      title: "Fix auth",
      cwd: "/tmp/app",
      providerId: "grok-build",
    });
    const bound = useAgentChatCenterTabsStore.getState().tabsByContext["ws-1"]?.[0];
    expect(bound?.value).toBe(tab.value);
    expect(bound?.chatId).toBe("conv-1");
    expect(bound?.title).toBe("Fix auth");
    expect(bound?.providerId).toBe("grok-build");
    expect(bound?.hasMessages).toBe(false);
  });

  it("patches session title after the agent reports one", () => {
    const tab = useAgentChatCenterTabsStore.getState().openDraftTab({ contextId: "ws-1" });
    useAgentChatCenterTabsStore.getState().bindChat({
      contextId: "ws-1",
      value: tab.value,
      chatId: "conv-1",
      title: "hello",
      providerId: "grok-build",
    });
    useAgentChatCenterTabsStore.getState().patchChat({
      contextId: "ws-1",
      chatId: "conv-1",
      title: "Intro for new contributors",
    });
    expect(useAgentChatCenterTabsStore.getState().tabsByContext["ws-1"]?.[0]?.title).toBe(
      "Intro for new contributors",
    );
  });

  it("marks a bound tab as having messages once the transcript exists", () => {
    const tab = useAgentChatCenterTabsStore.getState().openDraftTab({ contextId: "ws-1" });
    useAgentChatCenterTabsStore.getState().bindChat({
      contextId: "ws-1",
      value: tab.value,
      chatId: "conv-1",
    });
    useAgentChatCenterTabsStore.getState().patchChat({
      contextId: "ws-1",
      chatId: "conv-1",
      hasMessages: true,
    });
    expect(useAgentChatCenterTabsStore.getState().tabsByContext["ws-1"]?.[0]?.hasMessages).toBe(
      true,
    );
  });
});
