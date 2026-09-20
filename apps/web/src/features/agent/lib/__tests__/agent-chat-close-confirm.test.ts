import { describe, expect, it } from "bun:test";
import type { AttentionReason } from "@/features/agent/store/agent-attention-store";
import {
  resolveAgentChatAttentionReason,
  shouldConfirmCloseAgentChat,
} from "../agent-chat-close-confirm";

function panes(
  entries: Array<[string, AttentionReason]>,
): Map<string, { reason: AttentionReason }> {
  return new Map(entries.map(([id, reason]) => [id, { reason }]));
}

describe("resolveAgentChatAttentionReason", () => {
  it("prefers permission over task-complete across prefixed and raw keys", () => {
    expect(
      resolveAgentChatAttentionReason(
        "abc",
        panes([
          ["abc", "task_complete"],
          ["chat:abc", "permission_request"],
        ]),
      ),
    ).toBe("permission_request");
  });

  it("returns task-complete when that is the only latch", () => {
    expect(
      resolveAgentChatAttentionReason("abc", panes([["chat:abc", "task_complete"]])),
    ).toBe("task_complete");
  });

  it("ignores drafts and empty ids", () => {
    expect(resolveAgentChatAttentionReason("draft:xyz", panes([["draft:xyz", "task_complete"]]))).toBeNull();
    expect(resolveAgentChatAttentionReason("", panes([["chat:", "task_complete"]]))).toBeNull();
  });
});

describe("shouldConfirmCloseAgentChat", () => {
  it("does not confirm idle chats with no attention", () => {
    expect(
      shouldConfirmCloseAgentChat({
        chatId: "abc",
        occupancy: "idle",
        attentionReason: null,
      }),
    ).toBe(false);
  });

  it("confirms live running and permission occupancy", () => {
    expect(
      shouldConfirmCloseAgentChat({
        chatId: "abc",
        occupancy: "running",
        attentionReason: null,
      }),
    ).toBe(true);
    expect(
      shouldConfirmCloseAgentChat({
        chatId: "abc",
        occupancy: "permission_request",
        attentionReason: null,
      }),
    ).toBe(true);
  });

  it("confirms sticky need-attention and need-permission while idle", () => {
    expect(
      shouldConfirmCloseAgentChat({
        chatId: "abc",
        occupancy: "idle",
        attentionReason: "task_complete",
      }),
    ).toBe(true);
    expect(
      shouldConfirmCloseAgentChat({
        chatId: "abc",
        occupancy: "idle",
        attentionReason: "permission_request",
      }),
    ).toBe(true);
  });

  it("does not confirm drafts or missing chat ids", () => {
    expect(
      shouldConfirmCloseAgentChat({
        chatId: "draft:xyz",
        occupancy: "running",
        attentionReason: "permission_request",
      }),
    ).toBe(false);
    expect(
      shouldConfirmCloseAgentChat({
        chatId: "",
        occupancy: "running",
        attentionReason: "task_complete",
      }),
    ).toBe(false);
  });
});
