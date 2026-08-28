import { beforeEach, describe, expect, it } from "bun:test";
import { useAgentChatCenterTabsStore } from "./use-agent-chat-center-tabs";

describe("agent chat center tabs", () => {
  beforeEach(() => {
    useAgentChatCenterTabsStore.setState({ tabsByContext: {}, pendingActivate: null, pendingNewChat: 0 });
  });

  it("opens a draft tab without a conversation id", () => {
    const tab = useAgentChatCenterTabsStore.getState().openDraftTab({
      contextId: "ws-1",
      title: "New chat",
    });
    expect(tab.conversationId).toBeNull();
    expect(tab.value.startsWith("agent-chat:draft:")).toBe(true);
    expect(useAgentChatCenterTabsStore.getState().tabsByContext["ws-1"]).toHaveLength(1);
  });

  it("binds a conversation to the same tab after the first send", () => {
    const tab = useAgentChatCenterTabsStore.getState().openDraftTab({ contextId: "ws-1" });
    expect(tab.title).toBe("Agent Chat");
    expect(tab.providerId).toBeNull();
    useAgentChatCenterTabsStore.getState().bindConversation({
      contextId: "ws-1",
      value: tab.value,
      conversationId: "conv-1",
      title: "Fix auth",
      cwd: "/tmp/app",
      providerId: "grok-build",
    });
    const bound = useAgentChatCenterTabsStore.getState().tabsByContext["ws-1"]?.[0];
    expect(bound?.value).toBe(tab.value);
    expect(bound?.conversationId).toBe("conv-1");
    expect(bound?.title).toBe("Fix auth");
    expect(bound?.providerId).toBe("grok-build");
  });

  it("patches session title after the agent reports one", () => {
    const tab = useAgentChatCenterTabsStore.getState().openDraftTab({ contextId: "ws-1" });
    useAgentChatCenterTabsStore.getState().bindConversation({
      contextId: "ws-1",
      value: tab.value,
      conversationId: "conv-1",
      title: "hello",
      providerId: "grok-build",
    });
    useAgentChatCenterTabsStore.getState().patchConversation({
      contextId: "ws-1",
      conversationId: "conv-1",
      title: "Intro for new contributors",
    });
    expect(useAgentChatCenterTabsStore.getState().tabsByContext["ws-1"]?.[0]?.title).toBe(
      "Intro for new contributors",
    );
  });
});
