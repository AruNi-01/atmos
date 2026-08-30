// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { chatAttentionId } from "../agent-status-ack";

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
});
