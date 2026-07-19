// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";

import { getAgentPromptQueueKey, useDialogStore } from "./use-dialog-store";

const workspaceId = "workspace-1";

afterEach(() => {
  useDialogStore.setState({ agentChatPromptQueues: {}, agentChatDrafts: {} });
});

describe("agent prompt queue identity", () => {
  it("isolates queues and drafts by widget instance", () => {
    const firstKey = getAgentPromptQueueKey(workspaceId, null, "default", "widget-1");
    const secondKey = getAgentPromptQueueKey(workspaceId, null, "default", "widget-2");
    const store = useDialogStore.getState();

    expect(firstKey).not.toBe(secondKey);

    store.enqueueAgentChatPrompt({
      prompt: "First widget prompt",
      workspaceId,
      projectId: null,
      mode: "default",
      instanceKey: "widget-1",
      origin: "panel",
    });
    store.setAgentChatDraft(workspaceId, null, "default", "First draft", "widget-1");
    store.setAgentChatDraft(workspaceId, null, "default", "Second draft", "widget-2");

    expect(useDialogStore.getState().agentChatPromptQueues[firstKey]).toHaveLength(1);
    expect(useDialogStore.getState().agentChatPromptQueues[secondKey]).toBeUndefined();
    expect(store.getAgentChatDraft(workspaceId, null, "default", "widget-1")).toBe("First draft");
    expect(store.getAgentChatDraft(workspaceId, null, "default", "widget-2")).toBe("Second draft");
  });

  it("preserves context-level keys for non-widget chat panels", () => {
    expect(getAgentPromptQueueKey(workspaceId, null, "default")).toBe(`workspace:${workspaceId}`);
  });
});
