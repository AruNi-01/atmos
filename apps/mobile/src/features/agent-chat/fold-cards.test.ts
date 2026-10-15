// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type {
  AgentChatEvent,
  AgentChatPayload,
  GrokGoal,
} from "@atmos/api-types/ws/dto/agent-chat";
import { applyChatEvent, createChatTranscript } from "./fold-transcript";

function event(chatId: string, payload: AgentChatPayload, revision = 1): AgentChatEvent {
  return {
    chat_id: chatId,
    event_id: `e${revision}`,
    revision,
    payload,
  };
}

const goal: GrokGoal = {
  goal_id: "g1",
  objective: "Ship",
  status: "running",
  phase: "build",
  children: [],
};

describe("card transcript fold", () => {
  test("plan_updated upserts one plan part on the current assistant", () => {
    const user = applyChatEvent(
      createChatTranscript("chat-1"),
      event("chat-1", {
        type: "user_message",
        turn_id: "t1",
        message_id: "u1",
        text: "plan this",
      }),
    );
    const first = applyChatEvent(
      user.state,
      event("chat-1", { type: "plan_updated", plan: "first", turn_id: "t1" }, 2),
    );
    const assistant = first.state.messages.find((message) => message.role === "assistant");
    expect(assistant?.parts).toEqual([{ type: "plan", plan: "first" }]);
    const second = applyChatEvent(
      first.state,
      event("chat-1", { type: "plan_updated", plan: { markdown: "second" }, turn_id: "t1" }, 3),
    );
    const updated = second.state.messages.find((message) => message.role === "assistant");
    expect(updated?.parts.filter((part) => part.type === "plan")).toEqual([
      { type: "plan", plan: { markdown: "second" } },
    ]);
    expect(second.state.messages.filter((message) => message.role === "assistant")).toHaveLength(1);
  });

  test("usage_updated sets the current turn and keeps prior session numbers when the new value is null", () => {
    const idle = createChatTranscript("chat-1");
    const skipped = applyChatEvent(
      idle,
      event("chat-1", { type: "usage_updated", turn: { total_tokens: 4 } }),
    );
    expect(skipped.state).toBe(idle);

    const started = applyChatEvent(
      idle,
      event("chat-1", {
        type: "text_chunk",
        part_id: "p1",
        message_id: "a1",
        ordinal: 0,
        kind: "answer",
        offset: 0,
        text: "hi",
      }),
    );
    const turned = applyChatEvent(
      started.state,
      event("chat-1", { type: "usage_updated", turn: { total_tokens: 9 } }, 2),
    );
    expect(turned.state.messages[0]?.usage).toEqual({ total_tokens: 9 });

    const seeded = {
      ...turned.state,
      sessionUsage: { used: 10, context_window: 100, size: 80 },
    };
    const merged = applyChatEvent(
      seeded,
      event(
        "chat-1",
        {
          type: "usage_updated",
          session: { used: null, context_window: null, cost: { amount: 1, currency: "USD" } },
        },
        3,
      ),
    );
    expect(merged.state.sessionUsage?.used).toBe(10);
    expect(merged.state.sessionUsage?.context_window).toBe(100);
    expect(merged.state.sessionUsage?.cost).toEqual({ amount: 1, currency: "USD" });
    expect(merged.state.messages[0]?.usage).toEqual({ total_tokens: 9 });
  });

  test("context_usage_updated merges used and keeps the previous window", () => {
    const state = {
      ...createChatTranscript("chat-1"),
      sessionUsage: { used: 1, context_window: 100, size: 80 },
    };
    const next = applyChatEvent(state, event("chat-1", { type: "context_usage_updated", used: 9 }));
    expect(next.state.sessionUsage).toEqual({
      used: 9,
      context_window: 100,
      size: undefined,
    });
  });

  test("grok updates store the payload and clear when it is null", () => {
    const set = applyChatEvent(
      createChatTranscript("chat-1"),
      event("chat-1", { type: "grok_goal_updated", grok_goal: goal }),
    );
    expect(set.state.grokGoal).toEqual(goal);
    const cleared = applyChatEvent(
      set.state,
      event("chat-1", { type: "grok_goal_updated", grok_goal: null }, 2),
    );
    expect(cleared.state.grokGoal).toBeNull();
    const workflow = applyChatEvent(
      cleared.state,
      event(
        "chat-1",
        {
          type: "grok_workflow_updated",
          grok_workflow: {
            run_id: "w1",
            name: "Research",
            objective: "Look",
            status: "running",
            phases: [],
            agents: [],
          },
        },
        3,
      ),
    );
    expect(workflow.state.grokWorkflow?.objective).toBe("Look");
    const gone = applyChatEvent(
      workflow.state,
      event("chat-1", { type: "grok_workflow_updated", grok_workflow: null }, 4),
    );
    expect(gone.state.grokWorkflow).toBeNull();
  });

  test("createChatTranscript copies snapshot usage and grok cards", () => {
    const state = createChatTranscript("chat-1", [], {
      session_usage: { used: 3, context_window: 9 },
      grok_goal: goal,
      grok_workflow: null,
    });
    expect(state.sessionUsage).toEqual({ used: 3, context_window: 9 });
    expect(state.grokGoal).toEqual(goal);
    expect(state.grokWorkflow).toBeNull();
  });

  test("permission and queue folds still apply beside the new fields", () => {
    const seeded = createChatTranscript("chat-1", [], {
      session_usage: { used: 1, context_window: 2 },
    });
    const permission = applyChatEvent(
      seeded,
      event("chat-1", {
        type: "permission_requested",
        request: { request_id: "r1", description: "run", tool: "bash" },
      }),
    );
    expect(permission.state.pendingPermission?.request_id).toBe("r1");
    expect(permission.state.sessionUsage).toEqual({ used: 1, context_window: 2 });
    const queued = applyChatEvent(
      permission.state,
      event(
        "chat-1",
        {
          type: "queue_updated",
          items: [{ id: "q1", seq: 1, status: "queued", prompt: "next" }],
        },
        2,
      ),
    );
    expect(queued.state.queue).toEqual([
      {
        id: "q1",
        seq: 1,
        status: "queued",
        prompt: "next",
        display_prompt: undefined,
        attachments: undefined,
      },
    ]);
    expect(queued.state.pendingPermission?.request_id).toBe("r1");
  });
});
