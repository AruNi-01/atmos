// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  AgentChatCursorTracker,
  agentChatCursorFromMessage,
  agentChatResyncMessage,
  lastEventSeqFromSubscribe,
  NetworkUpdateGate,
  parseAgentChatResync,
  parseRelayCtrl,
} from "./mobile-ws-transport";

describe("mobile ws transport helpers", () => {
  test("parseRelayCtrl reads server_offline without inventing a seq", () => {
    expect(parseRelayCtrl({ type: "relay_ctrl", code: "server_offline" })).toEqual({
      code: "server_offline",
    });
    expect(
      parseRelayCtrl({ type: "notification", payload: { event: "agent_chat_event" } }),
    ).toBeNull();
  });

  test("cursor tracker advances from subscribe and live revisions only for tracked chats", () => {
    const tracker = new AgentChatCursorTracker();
    tracker.noteSubscribe("chat-1", 4);
    tracker.noteRevision("chat-1", 9);
    tracker.noteRevision("chat-2", 80);
    expect(tracker.snapshots()).toEqual([{ chat_id: "chat-1", after_sequence: 9 }]);
    expect(
      agentChatCursorFromMessage({
        type: "notification",
        payload: {
          event: "agent_chat_event",
          data: { chat_id: "chat-1", event_id: "e", revision: 11, payload: { type: "text_delta" } },
        },
      }),
    ).toEqual({ chatId: "chat-1", revision: 11 });
    tracker.noteUnsubscribe("chat-1");
    expect(tracker.snapshots()).toEqual([]);
  });

  test("NetworkUpdateGate ignores a stale async snapshot after a live event", () => {
    const gate = new NetworkUpdateGate();
    const id = gate.nextAsync();
    expect(gate.isCurrent(id)).toBe(true);
    gate.live();
    expect(gate.isCurrent(id)).toBe(false);
  });

  test("parseAgentChatResync reads a façade snapshot message", () => {
    const snapshot = {
      meta: { id: "chat-1", last_event_seq: 9 },
      messages: [],
      queue: [],
    };
    const message = agentChatResyncMessage("chat-1", snapshot as never);
    expect(parseAgentChatResync(message)).toEqual(message);
    expect(lastEventSeqFromSubscribe({ last_event_seq: 9 })).toBe(9);
    expect(parseAgentChatResync({ type: "relay_ctrl" })).toBeNull();
  });
});
