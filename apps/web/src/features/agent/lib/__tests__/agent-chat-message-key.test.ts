import { describe, expect, it } from "bun:test";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  stableAgentMessageKey,
  withStableAgentMessageIds,
} from "../agent-chat-message-key";

describe("stableAgentMessageKey", () => {
  it("uses the message id when present", () => {
    expect(stableAgentMessageKey({ id: "a1", role: "assistant", parts: [] }, 9)).toBe("a1");
  });

  it("does not key old sessions by list index when a fingerprint exists", () => {
    const legacy: AgentMessage = {
      role: "user",
      parts: [{ type: "text", text: "hello from an imported session" }],
      created_at: "2024-01-01T00:00:00.000Z",
    };
    const key = stableAgentMessageKey(legacy, 12);
    expect(key).not.toContain(":12");
    expect(key.startsWith("legacy:user:")).toBe(true);
    expect(stableAgentMessageKey(legacy, 99)).toBe(key);
  });
});

describe("withStableAgentMessageIds", () => {
  it("fills missing ids without rewriting rows that already have one", () => {
    const withId: AgentMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] };
    const legacy: AgentMessage = { role: "assistant", parts: [{ type: "text", text: "yo" }] };
    const next = withStableAgentMessageIds([withId, legacy]);
    expect(next[0]).toBe(withId);
    expect(next[1]?.id).toBe(stableAgentMessageKey(legacy, 1));
  });
});
