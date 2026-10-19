import { describe, expect, test } from "bun:test";
import type { AgentChatEvent, AgentChatPayload } from "@atmos/api-types/ws/dto/agent-chat";
import { AGENT_CHAT_REVISION_GAP_RESYNC } from "./event-gate";
import { createAgentChatEventPump } from "./event-pump";

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

describe("AgentChatEventPump hydrate", () => {
  test("buffers live events until the snapshot floor is observed", () => {
    const pump = createAgentChatEventPump();
    pump.startHydrate();
    const started = chatEvent(5, { type: "turn_started", turn_id: "t1" });
    const completed = chatEvent(6, { type: "turn_completed", turn_id: "t1" });
    expect(pump.ingest(started).action).toBe("buffer");
    expect(pump.ingest(completed).action).toBe("buffer");
    const drained = pump.finishHydrate(6);
    expect(drained[0]).toMatchObject({ action: "drop", reason: "stale_state" });
    expect(drained[1]?.action).toBe("apply");
    expect(pump.hydrating).toBe(false);
    expect(pump.cursor).toBe(6);
  });

  test("events newer than the snapshot apply after drain", () => {
    const pump = createAgentChatEventPump();
    pump.startHydrate();
    const live = chatEvent(11, { type: "turn_started", turn_id: "t2" });
    expect(pump.ingest(live).action).toBe("buffer");
    const drained = pump.finishHydrate(10);
    expect(drained).toEqual([{ action: "apply", event: live }]);
    const duplicate = pump.ingest(live);
    expect(duplicate.action).toBe("drop");
    expect(duplicate).toMatchObject({ reason: "duplicate_event_id" });
  });

  test("reconnect catch-up uses cursor, not a wiped snapshot seq", () => {
    const pump = createAgentChatEventPump();
    pump.startHydrate();
    const drained = pump.finishHydrate(10);
    expect(drained).toEqual([]);
    expect(pump.ingest(chatEvent(11, { type: "turn_started", turn_id: "t2" })).action).toBe(
      "apply",
    );
    expect(pump.cursor).toBe(11);
    expect(pump.shouldResyncFromServer(11)).toBe(false);
    expect(pump.shouldResyncFromServer(11 + AGENT_CHAT_REVISION_GAP_RESYNC)).toBe(true);
  });

  test("abandonHydrate leaves later live events applying", () => {
    const pump = createAgentChatEventPump();
    const gen = pump.startHydrate();
    expect(pump.ingest(chatEvent(4, { type: "turn_started", turn_id: "t1" })).action).toBe(
      "buffer",
    );
    pump.abandonHydrate(gen);
    expect(pump.hydrating).toBe(false);
    expect(pump.ingest(chatEvent(5, { type: "turn_completed", turn_id: "t1" })).action).toBe(
      "apply",
    );
  });

  test("a stale finishHydrate does not complete a newer hydrate", () => {
    const pump = createAgentChatEventPump();
    const first = pump.startHydrate();
    pump.ingest(chatEvent(11, { type: "turn_started", turn_id: "t2" }));
    const second = pump.startHydrate();
    expect(pump.finishHydrate(10, first)).toEqual([]);
    expect(pump.hydrating).toBe(true);
    const drained = pump.finishHydrate(10, second);
    expect(drained).toEqual([
      {
        action: "apply",
        event: chatEvent(11, { type: "turn_started", turn_id: "t2" }),
      },
    ]);
    expect(pump.hydrating).toBe(false);
  });

  test("a stale abandonHydrate does not drop a newer hydrate buffer", () => {
    const pump = createAgentChatEventPump();
    const first = pump.startHydrate();
    const second = pump.startHydrate();
    pump.ingest(chatEvent(12, { type: "turn_completed", turn_id: "t2" }));
    pump.abandonHydrate(first);
    expect(pump.hydrating).toBe(true);
    expect(pump.finishHydrate(10, second)).toHaveLength(1);
  });
});
