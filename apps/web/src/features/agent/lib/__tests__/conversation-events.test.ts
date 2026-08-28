import { describe, expect, it } from "bun:test";
import {
  foldTurnsFromEvent,
  foldUserRowsFromEvent,
} from "@/features/agent/lib/conversation-events";

describe("ACP slash commands stay on the conversation, not the turn fold", () => {
  it("available_commands_updated does not create a turn row", () => {
    const event = {
      conversation_id: "conv-1",
      payload: {
        type: "available_commands_updated",
        commands: [{ name: "plan", description: "Create a plan" }],
      },
    };
    expect(foldTurnsFromEvent([], event, "conv-1")).toEqual([]);
  });
});

describe("S16 standalone and center-stage share conversation events", () => {
  it("two subscribers fold the same send into the same message id", () => {
    const event = {
      conversation_id: "conv-1",
      payload: { type: "user_message", message_id: "msg-1", text: "hello-s16" },
    };
    const center = foldUserRowsFromEvent([], event, "conv-1");
    const standalone = foldUserRowsFromEvent([], event, "conv-1");
    expect(center).toEqual(standalone);
    expect(center).toEqual([{ id: "msg-1", text: "hello-s16" }]);
    expect(foldUserRowsFromEvent(center, event, "other")).toEqual(center);
  });

  it("folds assistant deltas into the live turn without replacing the user row", () => {
    const started = {
      conversation_id: "conv-1",
      payload: { type: "turn_started", turn_id: "t1" },
    };
    const user = {
      conversation_id: "conv-1",
      payload: { type: "user_message", turn_id: "t1", message_id: "u1", text: "hi" },
    };
    const delta = {
      conversation_id: "conv-1",
      payload: {
        type: "assistant_message_delta",
        turn_id: "t1",
        message_id: "a1",
        delta: "hel",
      },
    };
    const more = {
      conversation_id: "conv-1",
      payload: {
        type: "assistant_message_delta",
        turn_id: "t1",
        message_id: "a1",
        delta: "lo",
      },
    };
    const turns = foldTurnsFromEvent(
      foldTurnsFromEvent(foldTurnsFromEvent([], started, "conv-1"), user, "conv-1"),
      delta,
      "conv-1",
    );
    const next = foldTurnsFromEvent(turns, more, "conv-1");
    expect(next[0]?.messages[1]?.parts[0]?.text).toBe("hello");
  });

  it("folds tool calls into the live assistant message", () => {
    const started = {
      conversation_id: "conv-1",
      payload: { type: "turn_started", turn_id: "t1" },
    };
    const tool = {
      conversation_id: "conv-1",
      payload: {
        type: "tool_call_started",
        turn_id: "t1",
        tool_call: { tool_call_id: "tool-1", name: "Read", title: "Read file", status: "running" },
      },
    };
    const turns = foldTurnsFromEvent(foldTurnsFromEvent([], started, "conv-1"), tool, "conv-1");
    expect(turns[0]?.messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      tool_call_id: "tool-1",
      name: "Read",
    });
  });

  it("keeps tool input and title when a completed event sends generic placeholders", () => {
    const started = {
      conversation_id: "conv-1",
      payload: { type: "turn_started", turn_id: "t1" },
    };
    const begin = {
      conversation_id: "conv-1",
      payload: {
        type: "tool_call_started",
        turn_id: "t1",
        tool_call: {
          tool_call_id: "tool-1",
          name: "Read",
          title: "Read `/tmp/app/README.md`",
          status: "running",
          input: { variant: "ReadFile", target_file: "/tmp/app/README.md", limit: 150 },
        },
      },
    };
    const done = {
      conversation_id: "conv-1",
      payload: {
        type: "tool_call_completed",
        turn_id: "t1",
        tool_call: {
          tool_call_id: "tool-1",
          name: "Tool",
          title: "Tool",
          status: "completed",
          input: null,
          output: {
            type: "ReadFile",
            FileContent: { absolute_path: "/tmp/app/README.md", raw_output: "# hi\n" },
          },
        },
      },
    };
    const turns = foldTurnsFromEvent(
      foldTurnsFromEvent(foldTurnsFromEvent([], started, "conv-1"), begin, "conv-1"),
      done,
      "conv-1",
    );
    expect(turns[0]?.messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      name: "Read",
      title: "Read `/tmp/app/README.md`",
      status: "completed",
      input: { variant: "ReadFile", target_file: "/tmp/app/README.md", limit: 150 },
    });
    expect((turns[0]?.messages[0]?.parts[0] as { output?: { type?: string } }).output?.type).toBe("ReadFile");
  });
});
