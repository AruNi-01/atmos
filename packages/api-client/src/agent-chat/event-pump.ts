import type { AgentChatEvent } from "@atmos/api-types/ws/dto/agent-chat";
import {
  createAgentChatEventGate,
  type AgentChatEventGate,
  type AgentChatEventGateOptions,
  type AgentChatGateDecision,
} from "./event-gate";

export type AgentChatPumpIngest =
  | AgentChatGateDecision
  | { action: "buffer"; event: AgentChatEvent };

export type AgentChatHydrateGeneration = number;

export type AgentChatEventPump = {
  readonly cursor: number;
  readonly maxRevision: number;
  readonly hydrating: boolean;
  readonly gate: AgentChatEventGate;
  startHydrate(): AgentChatHydrateGeneration;
  ingest(event: AgentChatEvent): AgentChatPumpIngest;
  finishHydrate(
    snapshotSeq: number,
    generation?: AgentChatHydrateGeneration,
  ): AgentChatGateDecision[];
  abandonHydrate(generation?: AgentChatHydrateGeneration): AgentChatGateDecision[];
  shouldResyncFromServer(serverLastSeq: number): boolean;
  reset(): void;
};

/**
 * Hydrate buffer in front of {@link createAgentChatEventGate}. Live events that
 * arrive during `get()` stay queued until the snapshot floor is observed.
 * Failed hydrate (`abandonHydrate`) drains that buffer through the gate without
 * a new floor so a buffered completion is not deleted.
 */
export function createAgentChatEventPump(
  options: AgentChatEventGateOptions = {},
): AgentChatEventPump {
  const gate = createAgentChatEventGate(options);
  const pending: AgentChatEvent[] = [];
  let hydrating = false;
  let generation = 0;

  function isCurrent(token?: AgentChatHydrateGeneration): boolean {
    return token == null || token === generation;
  }

  return {
    get cursor() {
      return gate.cursor;
    },
    get maxRevision() {
      return gate.maxRevision;
    },
    get hydrating() {
      return hydrating;
    },
    get gate() {
      return gate;
    },
    startHydrate() {
      if (!hydrating) pending.length = 0;
      hydrating = true;
      generation += 1;
      return generation;
    },
    ingest(event: AgentChatEvent): AgentChatPumpIngest {
      if (hydrating) {
        pending.push(event);
        return { action: "buffer", event };
      }
      return gate.admit(event);
    },
    finishHydrate(
      snapshotSeq: number,
      token?: AgentChatHydrateGeneration,
    ): AgentChatGateDecision[] {
      if (!isCurrent(token)) return [];
      gate.observeSnapshot(snapshotSeq);
      hydrating = false;
      const queued = pending.splice(0, pending.length);
      return queued.map((event) => gate.admit(event));
    },
    abandonHydrate(token?: AgentChatHydrateGeneration) {
      if (!isCurrent(token)) return [];
      hydrating = false;
      const queued = pending.splice(0, pending.length);
      return queued.map((event) => gate.admit(event));
    },
    shouldResyncFromServer(serverLastSeq: number) {
      return gate.shouldResyncFromServer(serverLastSeq);
    },
    reset() {
      gate.reset();
      hydrating = false;
      pending.length = 0;
      generation = 0;
    },
  };
}
