import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";

function scopesEqual(left: ComputerQueryScope, right: ComputerQueryScope): boolean {
  return (
    left.activeInstanceId === right.activeInstanceId &&
    left.connectionEpoch === right.connectionEpoch &&
    left.relaySessionRevision === right.relaySessionRevision
  );
}

export type ResourceMonitorSubscriptionDeps = {
  subscribe: (scope: ComputerQueryScope) => Promise<ResourceMonitorSnapshot>;
  unsubscribe: (scope: ComputerQueryScope) => Promise<unknown>;
  isConnected: () => boolean;
  seedSnapshot: (scope: ComputerQueryScope, snapshot: ResourceMonitorSnapshot) => void;
};

type SubscriptionSlot = {
  id: number;
  scope: ComputerQueryScope;
};

/**
 * Owns one interactive Server subscription.
 * Captures the attach-time Computer scope so cleanup never talks to a newer connection.
 * Same-scope remounts (React StrictMode) skip unsubscribe so a replacement subscribe can take over.
 */
export function createResourceMonitorSubscriptionController(
  deps: ResourceMonitorSubscriptionDeps,
) {
  let nextId = 0;
  let active: SubscriptionSlot | null = null;

  return {
    attach(scope: ComputerQueryScope): () => void {
      const slot: SubscriptionSlot = { id: ++nextId, scope };
      active = slot;

      void deps
        .subscribe(scope)
        .then((snapshot) => {
          if (active?.id !== slot.id) return;
          deps.seedSnapshot(scope, snapshot);
        })
        .catch(() => {
          // Scope changed or the socket dropped before subscribe completed.
        });

      return () => {
        const captured = slot;
        if (active?.id === captured.id) {
          active = null;
        }

        queueMicrotask(() => {
          const current = active;
          if (
            current &&
            current.id !== captured.id &&
            scopesEqual(current.scope, captured.scope)
          ) {
            return;
          }
          if (!deps.isConnected()) return;
          void deps.unsubscribe(captured.scope).catch(() => {
            // Stale scope or already-disconnected socket — do not retry.
          });
        });
      };
    },
  };
}
