import { describe, expect, it } from "bun:test";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentActivity, AgentTurn } from "@atmos/api-types/ws/dto/events";
import {
  historyRefreshKey,
  observerHistoryRequest,
  promptsMatch,
  splitSessionHistory,
  userMessageText,
} from "@/features/agent/lib/observer-session-history";

function activity(partial: Partial<AgentActivity> = {}): AgentActivity {
  return {
    session_id: "pane-1",
    tool: "claude-code",
    last_state: "idle",
    todos: [],
    children: [],
    turns: [],
    turns_omitted: 0,
    started_at: "t",
    last_event_at: "t",
    ...partial,
  };
}

function turn(partial: Partial<AgentTurn> & Pick<AgentTurn, "turn_id" | "prompt">): AgentTurn {
  return {
    started_at: "t",
    tools: [],
    todos: [],
    spawned_child_ids: [],
    ...partial,
  };
}

function user(text: string, id = text): AgentMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistant(text: string, id = text): AgentMessage {
  return { id, role: "assistant", parts: [{ type: "text", text }] };
}

describe("observerHistoryRequest", () => {
  it("loads a chat from its chat id", () => {
    expect(observerHistoryRequest(activity({
      session_id: "chat:chat-1",
      surface: "chat",
      surface_id: "chat-1",
      tool: "grok-build",
    }))).toEqual({ kind: "chat", chatId: "chat-1" });
  });

  it("strips the chat prefix when surface id is missing", () => {
    expect(observerHistoryRequest(activity({
      session_id: "chat:chat-2",
      surface: "chat",
    }))).toEqual({ kind: "chat", chatId: "chat-2" });
  });

  it("loads a terminal session from the vendor guid", () => {
    expect(observerHistoryRequest(activity({
      native_session_id: "lead-guid",
      host_provider_id: "claude",
    }))).toEqual({ kind: "host", key: "claude:lead-guid" });
  });

  it("derives the host provider from the tool when the field is empty", () => {
    expect(observerHistoryRequest(activity({
      tool: "grok-build",
      native_session_id: "grok-guid",
    }))).toEqual({ kind: "host", key: "grok:grok-guid" });
  });

  it("does not ask for a session source the host roster does not have", () => {
    expect(observerHistoryRequest(activity({
      tool: "gemini",
      native_session_id: "gem-guid",
      host_provider_id: "gemini",
    }))).toBeNull();
    expect(observerHistoryRequest(activity({ tool: "claude-code" }))).toBeNull();
  });
});

describe("splitSessionHistory", () => {
  it("keeps every hook turn when no transcript has loaded", () => {
    const turns = [
      turn({ turn_id: 1, prompt: "delegate", ended_at: "t2" }),
      turn({ turn_id: 2, prompt: "also add tests" }),
    ];
    expect(splitSessionHistory([], turns)).toEqual({
      messages: [],
      hookTurnIds: [1, 2],
    });
  });

  it("uses the transcript once an ended turn is already in it", () => {
    const messages = [user("delegate"), assistant("done"), user("also add tests"), assistant("added")];
    const split = splitSessionHistory(messages, [
      turn({ turn_id: 1, prompt: "delegate", ended_at: "t2" }),
      turn({ turn_id: 2, prompt: "also add tests", ended_at: "t3" }),
    ]);
    expect(split.messages.map(userMessageText).filter(Boolean)).toEqual(["delegate", "also add tests"]);
    expect(split.hookTurnIds).toEqual([]);
  });

  it("keeps the open turn on hooks and the earlier transcript above it", () => {
    const messages = [
      user("delegate"),
      assistant("done"),
      user("also add tests"),
      assistant("partial"),
    ];
    const split = splitSessionHistory(messages, [
      turn({ turn_id: 1, prompt: "delegate", ended_at: "t2" }),
      turn({ turn_id: 2, prompt: "also add tests" }),
    ]);
    expect(split.messages.map((message) => message.id)).toEqual(["delegate", "done"]);
    expect(split.hookTurnIds).toEqual([2]);
  });

  it("appends a follow-up the transcript does not have yet", () => {
    const messages = [user("delegate"), assistant("done")];
    const split = splitSessionHistory(messages, [
      turn({ turn_id: 1, prompt: "delegate", ended_at: "t2" }),
      turn({ turn_id: 2, prompt: "please refactor the observer drawer and keep the cards" }),
    ]);
    expect(split.messages).toHaveLength(2);
    expect(split.hookTurnIds).toEqual([2]);
  });

  it("does not treat a short prompt as a prefix of a later one", () => {
    expect(promptsMatch("ok", "ok and also rewrite the drawer")).toBe(false);
    expect(promptsMatch("delegate", "delegate")).toBe(true);
  });

  it("drops a leaked child prompt and keeps the real follow-up", () => {
    const follow = "please refactor the observer drawer and keep the cards";
    const split = splitSessionHistory(
      [user("delegate"), assistant("done")],
      [
        turn({ turn_id: 1, prompt: "delegate", ended_at: "t2" }),
        turn({ turn_id: 2, prompt: "scan the tree" }),
        turn({ turn_id: 3, prompt: follow }),
      ],
      [{
        child_id: "c1",
        state: "running",
        recent_tools: [],
        prompt: "scan the tree",
        started_at: "t",
        last_event_at: "t",
      }],
    );
    expect(split.hookTurnIds).toEqual([3]);
  });
});

describe("historyRefreshKey", () => {
  it("changes when a turn opens or closes, not when the prompt text is unchanged", () => {
    const first = activity({
      current_turn_id: 1,
      turns: [turn({ turn_id: 1, prompt: "delegate" })],
    });
    const closed = activity({
      current_turn_id: null,
      turns: [turn({ turn_id: 1, prompt: "delegate", ended_at: "t2" })],
    });
    expect(historyRefreshKey(first)).not.toBe(historyRefreshKey(closed));
  });
});
