import { describe, expect, it, beforeEach } from "bun:test";
import {
  agentChatPlanExpandKey,
  agentChatProcessExpandKey,
  agentChatToolExpandKey,
  agentChatUserBodyExpandKey,
  agentChatUserMetaExpandKey,
  useAgentChatExpandStore,
} from "../agent-chat-expand-store";

describe("agent chat expand store", () => {
  beforeEach(() => {
    useAgentChatExpandStore.setState({ values: {} });
  });

  it("keeps tool/plan/process open state after a virtual-row remount of the same key", () => {
    const tool = agentChatToolExpandKey("call-1");
    const plan = agentChatPlanExpandKey("chat-9");
    const process = agentChatProcessExpandKey("a1");
    useAgentChatExpandStore.getState().setExpand(tool, true);
    useAgentChatExpandStore.getState().setExpand(plan, false);
    useAgentChatExpandStore.getState().setExpand(process, true);

    expect(useAgentChatExpandStore.getState().values[tool]).toBe(true);
    expect(useAgentChatExpandStore.getState().values[plan]).toBe(false);
    expect(useAgentChatExpandStore.getState().values[process]).toBe(true);
  });

  it("keeps user body expand and selected time after a virtual-row remount of the same entry id", () => {
    const body = agentChatUserBodyExpandKey("entry-42");
    const meta = agentChatUserMetaExpandKey("entry-42");
    useAgentChatExpandStore.getState().setExpand(body, true);
    useAgentChatExpandStore.getState().setExpand(meta, true);

    expect(useAgentChatExpandStore.getState().values[body]).toBe(true);
    expect(useAgentChatExpandStore.getState().values[meta]).toBe(true);
    expect(body).toBe("user-body:entry-42");
    expect(meta).toBe("user-meta:entry-42");
  });

  it("ignores a no-op write so listeners do not churn", () => {
    const key = agentChatToolExpandKey("call-2");
    let ticks = 0;
    const unsub = useAgentChatExpandStore.subscribe(() => {
      ticks += 1;
    });
    useAgentChatExpandStore.getState().setExpand(key, true);
    useAgentChatExpandStore.getState().setExpand(key, true);
    unsub();
    expect(ticks).toBe(1);
  });
});
