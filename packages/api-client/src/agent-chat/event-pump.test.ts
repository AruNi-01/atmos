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

  test("abandonHydrate drains the buffer through the gate without a snapshot floor", () => {
    const pump = createAgentChatEventPump();
    const gen = pump.startHydrate();
    const started = chatEvent(1, { type: "turn_started", turn_id: "t1" });
    const completed = chatEvent(2, { type: "turn_completed", turn_id: "t1" });
    expect(pump.ingest(started).action).toBe("buffer");
    expect(pump.ingest(completed).action).toBe("buffer");
    const drained = pump.abandonHydrate(gen);
    expect(drained).toEqual([
      { action: "apply", event: started },
      { action: "apply", event: completed },
    ]);
    expect(pump.hydrating).toBe(false);
    expect(pump.cursor).toBe(2);
    expect(pump.ingest(completed)).toMatchObject({
      action: "drop",
      reason: "duplicate_event_id",
    });
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

  test("isHydrateGeneration is false for a superseded hydrate token", () => {
    const pump = createAgentChatEventPump();
    const first = pump.startHydrate();
    const second = pump.startHydrate();
    expect(pump.isHydrateGeneration(first)).toBe(false);
    expect(pump.isHydrateGeneration(second)).toBe(true);
    expect(pump.isHydrateGeneration()).toBe(true);
  });

  test("a later façade snapshot reuses the same floor and cannot recede", () => {
    const pump = createAgentChatEventPump();
    pump.startHydrate();
    expect(pump.finishHydrate(50)).toEqual([]);
    const resync = pump.startHydrate();
    expect(pump.finishHydrate(20, resync)).toEqual([]);
    const delayed = pump.ingest(
      chatEvent(25, { type: "queue_updated", items: [] }, "unseen-after-resync"),
    );
    expect(delayed).toMatchObject({ action: "drop", reason: "stale_state" });
  });

  test("agent_chat_resync finishHydrate drains live events through the existing floor", () => {
    const pump = createAgentChatEventPump();
    pump.startHydrate();
    expect(pump.finishHydrate(10)).toEqual([]);
    const resync = pump.startHydrate();
    const live = chatEvent(21, { type: "turn_started", turn_id: "t2" });
    expect(pump.ingest(live).action).toBe("buffer");
    expect(pump.finishHydrate(20, resync)).toEqual([{ action: "apply", event: live }]);
    expect(pump.cursor).toBe(21);
    expect(pump.ingest(live)).toMatchObject({
      action: "drop",
      reason: "duplicate_event_id",
    });
  });
});
