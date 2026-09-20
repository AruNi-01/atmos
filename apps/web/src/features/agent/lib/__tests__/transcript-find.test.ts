import { describe, expect, it } from "bun:test";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  firstTranscriptFindIndex,
  resolveTranscriptFindScrollIndex,
  transcriptFindMessageIndexes,
  transcriptFindText,
} from "@/features/agent/lib/transcript-find";

function user(id: string, text: string): AgentMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistant(id: string, parts: AgentMessage["parts"]): AgentMessage {
  return { id, role: "assistant", parts };
}

describe("transcript find corpus", () => {
  const messages: AgentMessage[] = [
    user("u1", "请看登录页"),
    assistant("a1", [
      { type: "thinking", text: "内部思考登录页" },
      { type: "tool_call", tool_call_id: "t1", name: "Read", kind: "read", status: "completed", params: { type: "read", path: "a.ts" } },
      { type: "text", text: "已核对登录页布局" },
    ]),
    user("u2", "换个话题"),
    assistant("a2", [{ type: "text", text: "好的" }]),
  ];

  it("indexes user prompts and final assistant replies, not thinking", () => {
    expect(transcriptFindText(messages[0]!)).toBe("请看登录页");
    expect(transcriptFindText(messages[1]!)).toBe("已核对登录页布局");
    expect(transcriptFindMessageIndexes(messages, "登录页")).toEqual([0, 1]);
    expect(transcriptFindMessageIndexes(messages, "内部思考")).toEqual([]);
    expect(transcriptFindMessageIndexes(messages, "换个")).toEqual([2]);
  });

  it("jumps to the locator when it is a hit, otherwise the next hit", () => {
    expect(firstTranscriptFindIndex([0, 1], 1)).toBe(1);
    expect(resolveTranscriptFindScrollIndex([0, 1], 1)).toBe(1);
    expect(resolveTranscriptFindScrollIndex([0, 1], 3)).toBe(0);
    expect(resolveTranscriptFindScrollIndex([], 2)).toBe(2);
    expect(resolveTranscriptFindScrollIndex([], -1)).toBeNull();
  });
});
