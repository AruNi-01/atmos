/**
 * Lightweight activity record for agent-driven surfaces that do not own a
 * tldraw editor (Prototype Design). Canvas keeps a richer store on top of
 * the same view-state shape so the island can stay shared.
 */

export type AgentSurfaceSessionStatus = "active" | "idle";

export type AgentSurfaceViewState = {
  inflight: boolean;
  session: AgentSurfaceSessionStatus | null;
};

export type AgentSurfaceActivity = {
  command: string;
  targetIds: string[];
  at: number;
};

const EMPTY_VIEW_STATE: AgentSurfaceViewState = {
  inflight: false,
  session: null,
};

export function resolveAgentSurfaceIslandWorking(
  viewState: AgentSurfaceViewState,
  recentlyActive: boolean,
  feedEntryActive: boolean,
): boolean {
  if (viewState.session === "idle") return false;
  if (viewState.session === "active") return true;
  return viewState.inflight || feedEntryActive || recentlyActive;
}

export class AgentSurfaceActivityStore {
  private last: AgentSurfaceActivity | null = null;
  private inflightDepth = 0;
  private inflight = false;
  private session: AgentSurfaceSessionStatus | null = null;
  private listeners = new Set<() => void>();
  private cachedViewState: AgentSurfaceViewState = EMPTY_VIEW_STATE;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AgentSurfaceActivity | null => this.last;

  getViewState = (): AgentSurfaceViewState => this.cachedViewState;

  beginWork() {
    this.session = null;
    this.inflightDepth += 1;
    this.inflight = true;
    this.emit();
  }

  endWork() {
    if (this.inflightDepth <= 0) return;
    this.inflightDepth -= 1;
    this.inflight = this.inflightDepth > 0;
    this.emit();
  }

  record(command: string, targetIds: string[] = []) {
    this.last = {
      command,
      targetIds: [...targetIds],
      at: Date.now(),
    };
    this.emit();
  }

  clear() {
    let changed = false;
    if (this.last !== null) {
      this.last = null;
      changed = true;
    }
    if (this.inflightDepth > 0 || this.inflight) {
      this.inflightDepth = 0;
      this.inflight = false;
      changed = true;
    }
    if (this.session !== null) {
      this.session = null;
      changed = true;
    }
    if (changed) this.emit();
  }

  private emit() {
    this.cachedViewState = {
      inflight: this.inflight,
      session: this.session,
    };
    for (const listener of this.listeners) listener();
  }
}
