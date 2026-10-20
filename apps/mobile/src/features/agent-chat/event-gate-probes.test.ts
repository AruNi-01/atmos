// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type {
  AgentChatEvent,
  AgentChatPayload,
  AgentMessage,
} from "@atmos/api-types/ws/dto/agent-chat";
import { createAgentChatEventGate } from "@atmos/api-client/agent-chat";
import { applyChatEvent, createChatTranscript } from "./fold-transcript";

function chatEvent(
  revision: number,
  payload: AgentChatPayload,
  eventId = `e${revision}`,
): AgentChatEvent {
  return {
    chat_id: "chat-1",
    event_id: eventId,
    revision,
    payload,
  };
}

function assistant(text: string): AgentMessage {
  return {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", text, message_id: "p1" }],
    streaming: true,
  };
}

function foldThrough(
  events: AgentChatEvent[],
  gated: boolean,
): ReturnType<typeof createChatTranscript> {
  const gate = createAgentChatEventGate();
  let state = createChatTranscript("chat-1");
  for (const event of events) {
    if (gated && gate.admit(event).action === "drop") continue;
    state = applyChatEvent(state, event).state;
  }
  return state;
}

function answerText(state: ReturnType<typeof createChatTranscript>): string {
  return (state.messages[0]?.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

describe("mobile fold + EventGate probe regressions", () => {
  test("turn_started replay after turn_completed does not stick busy", () => {
    const events = [
      chatEvent(1, { type: "turn_started", turn_id: "t1" }),
      chatEvent(2, { type: "turn_completed", turn_id: "t1" }),
      chatEvent(1, { type: "turn_started", turn_id: "t1" }, "replay-turn-started"),
    ];
    expect(foldThrough(events, false).runningTurnId).toBe("t1");
    expect(foldThrough(events, true).runningTurnId).toBeNull();
  });

  test("permission_requested replay after resolved does not resurrect the card", () => {
    const events = [
      chatEvent(3, {
        type: "permission_requested",
        request: { request_id: "perm-1", tool: "bash" },
      }),
      chatEvent(4, {
        type: "permission_resolved",
        request_id: "perm-1",
        option_id: "allow",
      }),
      chatEvent(
        3,
        {
          type: "permission_requested",
          request: { request_id: "perm-1", tool: "bash" },
        },
        "replay-perm",
      ),
    ];
    expect(foldThrough(events, false).pendingPermission?.request_id).toBe("perm-1");
    expect(foldThrough(events, true).pendingPermission).toBeNull();
  });

  test("old queue_updated does not resurrect a cleared queue", () => {
    const events = [
      chatEvent(8, {
        type: "queue_updated",
        items: [{ id: "q1", seq: 1, status: "queued", prompt: "next" }],
      }),
      chatEvent(9, { type: "queue_updated", items: [] }),
      chatEvent(
        8,
        {
          type: "queue_updated",
          items: [{ id: "q1", seq: 1, status: "queued", prompt: "next" }],
        },
        "replay-queue",
      ),
    ];
    expect(foldThrough(events, false).queue.map((item) => item.id)).toEqual(["q1"]);
    expect(foldThrough(events, true).queue).toEqual([]);
  });

  test("delayed queue cannot overwrite a newer snapshot floor", () => {
    const gate = createAgentChatEventGate();
    const filled = chatEvent(10, {
      type: "queue_updated",
      items: [{ id: "q1", seq: 1, status: "queued", prompt: "next" }],
    });
    expect(gate.admit(filled).action).toBe("apply");
    gate.observeSnapshot(50);
    const delayed = chatEvent(
      20,
      {
        type: "queue_updated",
        items: [{ id: "q1", seq: 1, status: "queued", prompt: "stale" }],
      },
      "unseen-old-queue",
    );
    expect(gate.admit(delayed).action).toBe("drop");
  });

  test("shared adapter event_id does not drop turn_completed after part_closed", () => {
    const events = [
      chatEvent(1, { type: "turn_started", turn_id: "t1" }, "start"),
      chatEvent(4, { type: "part_closed", part_id: "p1" }, "finish-turn"),
      chatEvent(5, { type: "turn_completed", turn_id: "t1" }, "finish-turn"),
    ];
    expect(foldThrough(events, true).runningTurnId).toBeNull();
  });

  test("old turn_snapshot does not roll assistant text back", () => {
    const events = [
      chatEvent(11, {
        type: "turn_snapshot",
        turn_id: "t1",
        messages: [assistant("Hello world")],
        open_part_ids: ["p1"],
      }),
      chatEvent(
        10,
        {
          type: "turn_snapshot",
          turn_id: "t1",
          messages: [assistant("Hello")],
          open_part_ids: ["p1"],
        },
        "old-snap",
      ),
    ];
    expect(answerText(foldThrough(events, false))).toBe("Hello");
    expect(answerText(foldThrough(events, true))).toBe("Hello world");
  });
});
