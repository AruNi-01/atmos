import { describe, expect, test } from "bun:test";
import type {
  AgentChatEvent,
  AgentChatPayload,
  AgentMessage,
} from "@atmos/api-types/ws/dto/agent-chat";
import {
  AGENT_CHAT_REVISION_GAP_RESYNC,
  agentChatEventStateKey,
  createAgentChatEventGate,
} from "./event-gate";

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

function snapshot(revision: number, text: string, eventId?: string): AgentChatEvent {
  return chatEvent(
    revision,
    {
      type: "turn_snapshot",
      turn_id: "t1",
      messages: [assistant(text)],
      open_part_ids: ["p1"],
    },
    eventId,
  );
}

function queueItems(...ids: string[]): Extract<AgentChatPayload, { type: "queue_updated" }> {
  return {
    type: "queue_updated",
    items: ids.map((id, index) => ({
      id,
      seq: index + 1,
      status: "queued",
      prompt: id,
    })),
  };
}

type ProbeState = {
  runningTurnId: string | null;
  pendingPermission: string | null;
  queue: string[];
  answer: string;
};

const emptyProbe: ProbeState = {
  runningTurnId: null,
  pendingPermission: null,
  queue: [],
  answer: "",
};

function foldProbe(state: ProbeState, event: AgentChatEvent): ProbeState {
  const payload = event.payload;
  if (payload.type === "turn_started") {
    return { ...state, runningTurnId: payload.turn_id };
  }
  if (payload.type === "turn_completed") {
    return {
      ...state,
      runningTurnId: state.runningTurnId === payload.turn_id ? null : state.runningTurnId,
    };
  }
  if (payload.type === "permission_requested") {
    return { ...state, pendingPermission: payload.request.request_id };
  }
  if (payload.type === "permission_resolved") {
    return { ...state, pendingPermission: null };
  }
  if (payload.type === "queue_updated") {
    return { ...state, queue: payload.items.map((item) => item.id) };
  }
  if (payload.type === "turn_snapshot") {
    const text = payload.messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    return { ...state, answer: text };
  }
  return state;
}

function run(events: AgentChatEvent[], gated: boolean, snapshotSeq?: number): ProbeState {
  const gate = createAgentChatEventGate();
  if (snapshotSeq != null) gate.observeSnapshot(snapshotSeq);
  let state = emptyProbe;
  for (const event of events) {
    if (gated) {
      const decision = gate.admit(event);
      if (decision.action === "drop") continue;
    }
    state = foldProbe(state, event);
  }
  return state;
}

describe("agentChatEventStateKey", () => {
  test("marks last-write-wins chrome and leaves text/tool ungated", () => {
    expect(agentChatEventStateKey({ type: "turn_started", turn_id: "t1" })).toBe("turn");
    expect(agentChatEventStateKey({ type: "turn_completed", turn_id: "t1" })).toBe("turn");
    expect(
      agentChatEventStateKey({
        type: "permission_requested",
        request: { request_id: "r1" },
      }),
    ).toBe("permission");
    expect(agentChatEventStateKey(queueItems("q1"))).toBe("queue");
    expect(
      agentChatEventStateKey({
        type: "turn_snapshot",
        turn_id: "t1",
        messages: [],
      }),
    ).toBe("turn_snapshot:t1");
    expect(
      agentChatEventStateKey({
        type: "text_chunk",
        part_id: "p1",
        message_id: "a1",
        ordinal: 0,
        kind: "answer",
        offset: 0,
        text: "hi",
      }),
    ).toBeNull();
    expect(
      agentChatEventStateKey({
        type: "tool_call_completed",
        tool_call: { tool_call_id: "c1", name: "Read", status: "completed" },
      }),
    ).toBeNull();
    expect(
      agentChatEventStateKey({
        type: "session_lifecycle",
        turn_id: "t1",
        message_id: "m1",
        action: "create",
        status: "running",
      }),
    ).toBe("session_lifecycle:t1");
    expect(
      agentChatEventStateKey({
        type: "session_lifecycle",
        turn_id: "t1",
        message_id: "m1",
        action: "resume",
        status: "completed",
      }),
    ).toBe("session_lifecycle:t1");
  });
});

describe("EventGate duplicates", () => {
  test("same event_id is dropped even when revision is newer", () => {
    const gate = createAgentChatEventGate();
    const first = chatEvent(1, { type: "turn_started", turn_id: "t1" }, "same");
    const replay = chatEvent(99, { type: "turn_started", turn_id: "t1" }, "same");
    expect(gate.admit(first).action).toBe("apply");
    expect(gate.admit(replay)).toEqual({
      action: "drop",
      event: replay,
      reason: "duplicate_event_id",
    });
  });

  test("missing event_id is not treated as a duplicate", () => {
    const gate = createAgentChatEventGate();
    const first = chatEvent(1, { type: "turn_started", turn_id: "t1" }, "");
    const second = chatEvent(2, { type: "turn_started", turn_id: "t2" }, "");
    expect(gate.admit(first).action).toBe("apply");
    expect(gate.admit(second).action).toBe("apply");
  });

  test("one adapter event_id can emit runtime_status then available_commands_updated", () => {
    const gate = createAgentChatEventGate();
    const status = chatEvent(1, { type: "runtime_status", status: "ready" }, "session-started");
    const commands = chatEvent(
      2,
      { type: "available_commands_updated", commands: [{ name: "help" }] },
      "session-started",
    );
    expect(gate.admit(status).action).toBe("apply");
    expect(gate.admit(commands).action).toBe("apply");
    expect(gate.admit(status).reason).toBe("duplicate_event_id");
  });

  test("finish_turn part_closed then turn_completed with the same adapter id both apply", () => {
    const gate = createAgentChatEventGate();
    const closed = chatEvent(4, { type: "part_closed", part_id: "p1" }, "finish-turn");
    const completed = chatEvent(
      5,
      { type: "turn_completed", turn_id: "t1", status: "ok" },
      "finish-turn",
    );
    expect(gate.admit(closed).action).toBe("apply");
    expect(gate.admit(completed).action).toBe("apply");
    expect(gate.admit(completed).reason).toBe("duplicate_event_id");
  });
});

describe("EventGate out of order", () => {
  test("late lower-revision state is dropped after a newer write of the same key", () => {
    const gate = createAgentChatEventGate();
    expect(gate.admit(chatEvent(20, queueItems())).action).toBe("apply");
    const stale = chatEvent(15, queueItems("old"));
    expect(gate.admit(stale)).toMatchObject({
      action: "drop",
      reason: "stale_state",
    });
  });

  test("out-of-order non-state events both apply", () => {
    const gate = createAgentChatEventGate();
    const later = chatEvent(12, {
      type: "text_chunk",
      part_id: "p1",
      message_id: "a1",
      ordinal: 0,
      kind: "answer",
      offset: 5,
      text: "world",
    });
    const earlier = chatEvent(11, {
      type: "text_chunk",
      part_id: "p1",
      message_id: "a1",
      ordinal: 0,
      kind: "answer",
      offset: 0,
      text: "hello",
    });
    expect(gate.admit(later).action).toBe("apply");
    expect(gate.admit(earlier).action).toBe("apply");
  });

  test("a one-event hole is catch_up, not resync", () => {
    const gate = createAgentChatEventGate();
    gate.observeSnapshot(10);
    const jumped = gate.admit(chatEvent(12, { type: "turn_started", turn_id: "t2" }));
    expect(jumped.action).toBe("apply");
    expect(jumped.gap).toEqual({
      from: 11,
      to: 11,
      size: 1,
      recommend: "catch_up",
    });
    const filled = gate.admit(
      chatEvent(11, { type: "user_message", turn_id: "t2", message_id: "u1", text: "hi" }),
    );
    expect(filled.action).toBe("apply");
    expect(filled.gap).toBeUndefined();
    expect(gate.cursor).toBe(12);
  });

  test("the next contiguous revision is not a gap", () => {
    const gate = createAgentChatEventGate();
    gate.observeSnapshot(10);
    const next = gate.admit(chatEvent(11, { type: "turn_started", turn_id: "t2" }));
    expect(next.action).toBe("apply");
    expect(next.gap).toBeUndefined();
    expect(gate.cursor).toBe(11);
  });
});

describe("EventGate reconnect replay", () => {
  test("observeSnapshot then replay of older state is dropped without an event_id match", () => {
    const events = [
      chatEvent(5, { type: "turn_started", turn_id: "t1" }),
      chatEvent(6, { type: "turn_completed", turn_id: "t1" }),
      chatEvent(5, { type: "turn_started", turn_id: "t1" }, "replay-started"),
    ];
    expect(run(events, false).runningTurnId).toBe("t1");
    expect(run(events, true, 6).runningTurnId).toBeNull();
  });

  test("subscribe cursor stays on the contiguous prefix, not maxRevision", () => {
    const gate = createAgentChatEventGate();
    gate.observeSnapshot(10);
    gate.admit(chatEvent(14, { type: "turn_started", turn_id: "t2" }));
    expect(gate.maxRevision).toBe(14);
    expect(gate.cursor).toBe(10);
    expect(gate.shouldResyncFromServer(10 + AGENT_CHAT_REVISION_GAP_RESYNC)).toBe(true);
    expect(gate.shouldResyncFromServer(11)).toBe(false);
  });

  test("text_chunk with revision behind the snapshot floor still applies", () => {
    const gate = createAgentChatEventGate();
    gate.observeSnapshot(20);
    const late = chatEvent(18, {
      type: "text_chunk",
      part_id: "p1",
      message_id: "a1",
      ordinal: 0,
      kind: "answer",
      offset: 0,
      text: "late",
    });
    expect(gate.admit(late).action).toBe("apply");
  });
});

describe("EventGate Lagged replay", () => {
  test("replaying the recent-event ring by event_id is a no-op", () => {
    const live = [
      chatEvent(5, { type: "turn_started", turn_id: "t1" }),
      chatEvent(6, { type: "turn_completed", turn_id: "t1" }),
      chatEvent(7, queueItems()),
      snapshot(8, "Hello world"),
    ];
    const gate = createAgentChatEventGate();
    let state = emptyProbe;
    for (const event of live) {
      expect(gate.admit(event).action).toBe("apply");
      state = foldProbe(state, event);
    }
    for (const event of live) {
      expect(gate.admit(event).reason).toBe("duplicate_event_id");
    }
    expect(state).toEqual({
      runningTurnId: null,
      pendingPermission: null,
      queue: [],
      answer: "Hello world",
    });
  });

  test("Lagged replay with fresh event_ids still cannot roll state back", () => {
    const live = [
      chatEvent(5, { type: "turn_started", turn_id: "t1" }),
      chatEvent(10, { type: "turn_completed", turn_id: "t1" }),
    ];
    const lagged = chatEvent(5, { type: "turn_started", turn_id: "t1" }, "lagged-started");
    expect(run([...live, lagged], false).runningTurnId).toBe("t1");
    expect(run([...live, lagged], true).runningTurnId).toBeNull();
  });
});

describe("EventGate probe regressions", () => {
  test("turn_started replay after turn_completed does not stick busy", () => {
    const events = [
      chatEvent(1, { type: "turn_started", turn_id: "t1" }),
      chatEvent(2, { type: "turn_completed", turn_id: "t1" }),
      chatEvent(1, { type: "turn_started", turn_id: "t1" }, "replay-turn-started"),
    ];
    expect(run(events, false).runningTurnId).toBe("t1");
    expect(run(events, true).runningTurnId).toBeNull();
  });

  test("permission_requested replay after resolved does not resurrect the card", () => {
    const events = [
      chatEvent(3, {
        type: "permission_requested",
        request: { request_id: "perm-1", tool: "bash" },
      }),
      chatEvent(4, { type: "permission_resolved", request_id: "perm-1", option_id: "allow" }),
      chatEvent(
        3,
        {
          type: "permission_requested",
          request: { request_id: "perm-1", tool: "bash" },
        },
        "replay-perm",
      ),
    ];
    expect(run(events, false).pendingPermission).toBe("perm-1");
    expect(run(events, true).pendingPermission).toBeNull();
  });

  test("old queue_updated does not resurrect a cleared queue", () => {
    const events = [
      chatEvent(8, queueItems("q1", "q2")),
      chatEvent(9, queueItems()),
      chatEvent(8, queueItems("q1", "q2"), "replay-queue"),
    ];
    expect(run(events, false).queue).toEqual(["q1", "q2"]);
    expect(run(events, true).queue).toEqual([]);
  });

  test("old turn_snapshot does not roll assistant text back", () => {
    const events = [snapshot(11, "Hello world"), snapshot(10, "Hello", "old-snap")];
    expect(run(events, false).answer).toBe("Hello");
    expect(run(events, true).answer).toBe("Hello world");
  });
});

describe("EventGate gap detection", () => {
  test("a jump past the resync threshold recommends resync and still applies", () => {
    const gate = createAgentChatEventGate();
    gate.observeSnapshot(1);
    const jumped = gate.admit(
      chatEvent(1 + AGENT_CHAT_REVISION_GAP_RESYNC + 2, {
        type: "turn_started",
        turn_id: "t9",
      }),
    );
    expect(jumped.action).toBe("apply");
    expect(jumped.gap?.recommend).toBe("resync");
    expect(jumped.gap?.size).toBeGreaterThanOrEqual(AGENT_CHAT_REVISION_GAP_RESYNC - 1);
  });

  test("live gap and shouldResyncFromServer share the ahead >= 32 boundary", () => {
    const cursor = 10;
    const catchUpRev = cursor + AGENT_CHAT_REVISION_GAP_RESYNC - 1;
    const resyncRev = cursor + AGENT_CHAT_REVISION_GAP_RESYNC;

    const catchUpGate = createAgentChatEventGate();
    catchUpGate.observeSnapshot(cursor);
    const catchUp = catchUpGate.admit(
      chatEvent(catchUpRev, { type: "turn_started", turn_id: "t-catch" }),
    );
    expect(catchUp.action).toBe("apply");
    expect(catchUp.gap).toEqual({
      from: cursor + 1,
      to: catchUpRev - 1,
      size: AGENT_CHAT_REVISION_GAP_RESYNC - 2,
      recommend: "catch_up",
    });
    expect(catchUpGate.shouldResyncFromServer(catchUpRev)).toBe(false);

    const resyncGate = createAgentChatEventGate();
    resyncGate.observeSnapshot(cursor);
    const resync = resyncGate.admit(
      chatEvent(resyncRev, { type: "turn_started", turn_id: "t-resync" }),
    );
    expect(resync.action).toBe("apply");
    expect(resync.gap).toEqual({
      from: cursor + 1,
      to: resyncRev - 1,
      size: AGENT_CHAT_REVISION_GAP_RESYNC - 1,
      recommend: "resync",
    });
    expect(resyncGate.shouldResyncFromServer(resyncRev)).toBe(true);
  });
});

describe("EventGate snapshot floor", () => {
  test("a delayed state event cannot overwrite a newer snapshot", () => {
    const gate = createAgentChatEventGate();
    expect(gate.admit(chatEvent(10, queueItems("q1"))).action).toBe("apply");
    gate.observeSnapshot(50);
    const delayed = chatEvent(20, queueItems("old"), "unseen-old-queue");
    expect(gate.admit(delayed)).toMatchObject({
      action: "drop",
      reason: "stale_state",
    });
  });

  test("observeSnapshot cannot lower the snapshot floor", () => {
    const gate = createAgentChatEventGate();
    expect(gate.admit(chatEvent(10, queueItems("q1"))).action).toBe("apply");
    gate.observeSnapshot(50);
    gate.observeSnapshot(20);
    const delayed = chatEvent(25, queueItems("old"), "unseen-after-stale-snapshot");
    expect(gate.admit(delayed)).toMatchObject({
      action: "drop",
      reason: "stale_state",
    });
  });

  test("session_lifecycle create and resume share one floor per turn", () => {
    const gate = createAgentChatEventGate();
    const create = chatEvent(
      12,
      {
        type: "session_lifecycle",
        turn_id: "t1",
        message_id: "m1",
        action: "create",
        status: "completed",
      },
      "life-create",
    );
    const resume = chatEvent(
      8,
      {
        type: "session_lifecycle",
        turn_id: "t1",
        message_id: "m1",
        action: "resume",
        status: "running",
      },
      "life-resume",
    );
    expect(gate.admit(create).action).toBe("apply");
    expect(gate.admit(resume)).toMatchObject({
      action: "drop",
      reason: "stale_state",
    });
  });
});
