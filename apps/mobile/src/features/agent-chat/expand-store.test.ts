// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, test } from "bun:test";
import {
  agentChatInspectExpandKey,
  agentChatPlanExpandKey,
  agentChatProcessExpandKey,
  agentChatThinkingExpandKey,
  agentChatToolExpandKey,
  agentChatToolGroupExpandKey,
  agentChatUserBodyExpandKey,
  agentChatUserMetaExpandKey,
  expandResetForFirstMessage,
  useAgentChatExpandStore,
} from "./expand-store";

describe("agent chat expand store", () => {
  beforeEach(() => {
    useAgentChatExpandStore.setState({ values: {} });
  });

  test("key builders match web strings", () => {
    expect(agentChatProcessExpandKey("a1")).toBe("process:a1");
    expect(agentChatInspectExpandKey("a1")).toBe("inspect:a1");
    expect(agentChatToolGroupExpandKey("a1", "g2")).toBe("group:a1:g2");
    expect(agentChatToolExpandKey("call-1")).toBe("tool:call-1");
    expect(agentChatThinkingExpandKey("a1", 2)).toBe("thinking:a1:2");
    expect(agentChatPlanExpandKey("chat-9")).toBe("plan:chat-9");
    expect(agentChatUserBodyExpandKey("entry-42")).toBe("user-body:entry-42");
    expect(agentChatUserMetaExpandKey("entry-42")).toBe("user-meta:entry-42");
  });

  test("keeps values after a remount of the same key and ignores a no-op write", () => {
    const tool = agentChatToolExpandKey("call-2");
    let ticks = 0;
    const unsub = useAgentChatExpandStore.subscribe(() => {
      ticks += 1;
    });
    useAgentChatExpandStore.getState().setExpand(tool, true);
    useAgentChatExpandStore.getState().setExpand(tool, true);
    useAgentChatExpandStore.getState().setExpand(agentChatUserBodyExpandKey("entry-1"), true);
    unsub();
    expect(ticks).toBe(2);
    expect(useAgentChatExpandStore.getState().values[tool]).toBe(true);
  });

  test("reset clears the map and a second reset does not notify", () => {
    useAgentChatExpandStore.getState().setExpand(agentChatPlanExpandKey("s"), true);
    useAgentChatExpandStore.getState().reset();
    expect(useAgentChatExpandStore.getState().values).toEqual({});
    let ticks = 0;
    const unsub = useAgentChatExpandStore.subscribe(() => {
      ticks += 1;
    });
    useAgentChatExpandStore.getState().reset();
    unsub();
    expect(ticks).toBe(0);
  });

  test("resets only when the first message id changes from one chat to another", () => {
    expect(expandResetForFirstMessage(undefined, "m1")).toEqual({ reset: false, firstId: "m1" });
    expect(expandResetForFirstMessage("m1", "m1")).toEqual({ reset: false, firstId: "m1" });
    expect(expandResetForFirstMessage("m1", undefined)).toEqual({ reset: false, firstId: "m1" });
    expect(expandResetForFirstMessage("m1", "m9")).toEqual({ reset: true, firstId: "m9" });
  });
});
