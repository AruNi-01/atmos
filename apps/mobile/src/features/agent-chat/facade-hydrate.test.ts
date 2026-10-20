// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentChatEvent, AgentChatPayload } from "@atmos/api-types/ws/dto/agent-chat";
import { createAgentChatEventPump } from "@atmos/api-client/agent-chat";
import { createFacadeHydrateSession } from "./facade-hydrate";
import { applyOpenThreadResync, type OpenThreadResyncCtrl } from "./open-thread-resync";

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

function overflowCtrl(): OpenThreadResyncCtrl {
  return { overflowed: true, overflowGen: 1, resyncFetchGen: 0, cancelled: false };
}

describe("createFacadeHydrateSession", () => {
  test("a failed earlier facade fetch does not abandon a later hydrate", async () => {
    const pump = createAgentChatEventPump();
    const abandoned: number[] = [];
    const first = createFacadeHydrateSession(pump, (generation) => {
      abandoned.push(generation);
      pump.abandonHydrate(generation);
    });
    const second = createFacadeHydrateSession(pump, (generation) => {
      abandoned.push(generation);
      pump.abandonHydrate(generation);
    });

    let rejectFirst: (err: Error) => void = () => undefined;
    const firstFetch = first.fetchSnapshot(
      () =>
        new Promise<string>((_, reject) => {
          rejectFirst = reject;
        }),
    );
    await Promise.resolve();
    const live = chatEvent(21, { type: "turn_started", turn_id: "t2" });
    expect(pump.ingest(live).action).toBe("buffer");

    expect(await second.fetchSnapshot(async () => "replacement-2")).toBe("replacement-2");
    rejectFirst(new Error("get failed"));
    await expect(firstFetch).rejects.toThrow("get failed");

    expect(abandoned).toHaveLength(1);
    expect(pump.isHydrateGeneration(abandoned[0])).toBe(false);
    const secondGen = second.takeGeneration();
    expect(pump.isHydrateGeneration(secondGen)).toBe(true);
    expect(pump.finishHydrate(20, secondGen)).toEqual([{ action: "apply", event: live }]);
  });

  test("stale hydrate generation does not clear overflowed", async () => {
    const pump = createAgentChatEventPump();
    const state = overflowCtrl();
    const facade = createFacadeHydrateSession(pump, (generation) => {
      pump.abandonHydrate(generation);
    });
    const result = await applyOpenThreadResync({
      ctrl: state,
      incoming: "incoming",
      fetchReplacement: () => facade.fetchSnapshot(async () => "replacement"),
      publish: () => {
        const generation = facade.takeGeneration();
        pump.startHydrate();
        if (!pump.isHydrateGeneration(generation)) return false;
        pump.finishHydrate(20, generation);
        return true;
      },
    });
    expect(result).toBe("held");
    expect(state.overflowed).toBe(true);
    expect(pump.hydrating).toBe(true);
  });
});
