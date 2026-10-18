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

export type AgentChatEventPump = {
  readonly cursor: number;
  readonly maxRevision: number;
  readonly hydrating: boolean;
  readonly gate: AgentChatEventGate;
  startHydrate(): void;
  ingest(event: AgentChatEvent): AgentChatPumpIngest;
  finishHydrate(snapshotSeq: number): AgentChatGateDecision[];
  abandonHydrate(): void;
  shouldResyncFromServer(serverLastSeq: number): boolean;
  reset(): void;
};

/**
 * Hydrate buffer in front of {@link createAgentChatEventGate}. Live events that
 * arrive during `get()` stay queued until the snapshot floor is observed.
 */
export function createAgentChatEventPump(
  options: AgentChatEventGateOptions = {},
): AgentChatEventPump {
  const gate = createAgentChatEventGate(options);
  const pending: AgentChatEvent[] = [];
  let hydrating = false;

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
      hydrating = true;
      pending.length = 0;
    },
    ingest(event: AgentChatEvent): AgentChatPumpIngest {
      if (hydrating) {
        pending.push(event);
        return { action: "buffer", event };
      }
      return gate.admit(event);
    },
    finishHydrate(snapshotSeq: number): AgentChatGateDecision[] {
      gate.observeSnapshot(snapshotSeq);
      hydrating = false;
      const queued = pending.splice(0, pending.length);
      return queued.map((event) => gate.admit(event));
    },
    abandonHydrate() {
      hydrating = false;
      pending.length = 0;
    },
    shouldResyncFromServer(serverLastSeq: number) {
      return gate.shouldResyncFromServer(serverLastSeq);
    },
    reset() {
      gate.reset();
      hydrating = false;
      pending.length = 0;
    },
  };
}
