// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { chatAttentionId, chatAttentionLookupIds } from "../agent-status-ack";
import { attentionTabClass } from "@/features/agent/components/AgentAttentionIndicator";

describe("chatAttentionId", () => {
  it("keys a bound chat for attention ack", () => {
    expect(chatAttentionId("abc")).toBe("chat:abc");
    expect(chatAttentionId("  abc  ")).toBe("chat:abc");
  });

  it("does not ack drafts or empty ids", () => {
    expect(chatAttentionId(null)).toBeNull();
    expect(chatAttentionId("")).toBeNull();
    expect(chatAttentionId("draft:xyz")).toBeNull();
  });

  it("looks up prefixed and raw chat latch keys", () => {
    expect(chatAttentionLookupIds("abc")).toEqual(["chat:abc", "abc"]);
    expect(chatAttentionLookupIds("draft:xyz")).toEqual([]);
    expect(chatAttentionLookupIds("")).toEqual([]);
  });
});

describe("attentionTabClass", () => {
  it("uses the same bottom glow as terminal agent tabs", () => {
    expect(attentionTabClass(null)).toBe("");
    expect(attentionTabClass("permission_request")).toContain("agent-attention-ring-tab");
    expect(attentionTabClass("permission_request")).toContain("agent-attention-ring-permission");
    expect(attentionTabClass("task_complete")).toContain("agent-attention-ring-tab");
    expect(attentionTabClass("task_complete")).toContain("agent-attention-ring-complete");
  });
});
