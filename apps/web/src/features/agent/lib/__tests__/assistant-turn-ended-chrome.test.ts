import { describe, expect, it } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  deriveAgentActivity,
  shouldShowAssistantTurnEndedChrome,
} from "@/features/agent/lib/chat-helpers";
import {
  foldMessagesFromEvent,
  textFromParts,
} from "@/features/agent/lib/agent-chat-events";
import type { AgentChatEvent } from "@atmos/api-types/ws/dto/agent-chat";

function chatEvent(
  chatId: string,
  sequence: number,
  payload: AgentChatEvent["payload"],
): AgentChatEvent {
  return { chat_id: chatId, sequence, payload };
}

function assistant(parts: AgentPart[], extra: Partial<AgentMessage> = {}): AgentMessage {
  return { id: "a1", role: "assistant", parts, ...extra };
}

describe("assistant turn ended chrome after session create", () => {
  it("hides ended footer for create-session chrome even when streaming is false and worked_ms is live", () => {
    const message = assistant(
      [{
        type: "session_lifecycle",
        action: "create",
        status: "completed",
        duration_ms: 3000,
      }],
      {
        streaming: false,
        worked_ms: 3000,
        completed_at: "2026-09-05T11:07:55.000Z",
      },
    );
    expect(shouldShowAssistantTurnEndedChrome(message, "")).toBe(false);
  });

  it("stays generating through create chrome while the turn is open", () => {
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "plan" }] },
      assistant(
        [{
          type: "session_lifecycle",
          action: "create",
          status: "completed",
          duration_ms: 3000,
        }],
        { streaming: false, worked_ms: 3000 },
      ),
    ];
    expect(deriveAgentActivity(messages, true)).toMatchObject({
      busy: true,
      kind: "working",
      label: "Generating",
    });
  });

  it("create chrome → streaming → turn_completed shows ended chrome only at the end", () => {
    let messages: AgentMessage[] = [];
    messages = foldMessagesFromEvent(
      messages,
      chatEvent("chat-1", 1, {
        type: "user_message",
        message_id: "u1",
        text: "plan",
      }),
      "chat-1",
    );
    messages = foldMessagesFromEvent(
      messages,
      chatEvent("chat-1", 2, {
        type: "session_lifecycle",
        message_id: "session-t1",
        action: "create",
        status: "completed",
        duration_ms: 3000,
      }),
      "chat-1",
    );

    const afterCreate = messages.at(-1)!;
    expect(afterCreate.streaming).toBe(true);
    expect(shouldShowAssistantTurnEndedChrome(afterCreate, "")).toBe(false);
    expect(deriveAgentActivity(messages, true)).toMatchObject({ busy: true, label: "Generating" });

    // Premature settle must not flash ended chrome on chrome-only.
    const premature: AgentMessage = {
      ...afterCreate,
      streaming: false,
      worked_ms: 3000,
      completed_at: "2026-09-05T11:07:55.000Z",
    };
    expect(shouldShowAssistantTurnEndedChrome(premature, "")).toBe(false);

    messages = foldMessagesFromEvent(
      messages,
      chatEvent("chat-1", 3, {
        type: "assistant_message_delta",
        message_id: "a1",
        delta: "先澄清范围",
      }),
      "chat-1",
    );
    const streaming = messages.at(-1)!;
    expect(streaming.streaming).toBe(true);
    expect(streaming.completed_at).toBeNull();
    expect(shouldShowAssistantTurnEndedChrome(streaming, textFromParts(streaming.parts))).toBe(false);
    expect(deriveAgentActivity(messages, true)).toMatchObject({ busy: true, label: "Streaming" });

    messages = foldMessagesFromEvent(
      messages,
      chatEvent("chat-1", 4, {
        type: "turn_completed",
        turn_id: "t1",
        worked_ms: 12000,
        completed_at: "2026-09-05T11:08:07.000Z",
      }),
      "chat-1",
    );
    const done = messages.at(-1)!;
    expect(done.streaming).toBe(false);
    expect(shouldShowAssistantTurnEndedChrome(done, textFromParts(done.parts))).toBe(true);
    expect(deriveAgentActivity(messages, false)).toEqual({ busy: false });
  });
});
