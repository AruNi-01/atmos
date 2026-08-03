/**
 * Pure lifecycle controller for a single host's overlay surface.
 * Injectable clock + create/destroy for unit tests (no Electron imports).
 */

export type OverlayLifecycleState = {
  created: boolean;
  ready: boolean;
  activityGeneration: number;
  idleTimerToken: number | null;
};

export type OverlayLifecycleDeps = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (token: number) => void;
  idleMs: number;
  create: () => void | Promise<void>;
  destroy: () => void;
  onReady?: () => void;
};

export class OverlayLifecycleController {
  private state: OverlayLifecycleState = {
    created: false,
    ready: false,
    activityGeneration: 0,
    idleTimerToken: null,
  };

  constructor(private readonly deps: OverlayLifecycleDeps) {}

  getState(): Readonly<OverlayLifecycleState> {
    return { ...this.state };
  }

  /** First need → create; cancels idle destroy. */
  async ensure(): Promise<{ created: boolean; ready: boolean }> {
    this.cancelIdle();
    if (!this.state.created) {
      this.state.created = true;
      this.state.ready = false;
      await this.deps.create();
      this.state.ready = true;
      this.deps.onReady?.();
    }
    return { created: this.state.created, ready: this.state.ready };
  }

  /** Elevated layers still active — keep surface, reset idle. */
  noteActivity(): void {
    if (!this.state.created) return;
    this.cancelIdle();
    this.state.activityGeneration += 1;
  }

  /** Zero elevated layers — start idle countdown to destroy. */
  release(): void {
    if (!this.state.created) return;
    this.scheduleIdle();
  }

  /** Force teardown (host closed / tests). */
  forceDestroy(): void {
    this.cancelIdle();
    if (!this.state.created) return;
    this.deps.destroy();
    this.state.created = false;
    this.state.ready = false;
  }

  private scheduleIdle(): void {
    this.cancelIdle();
    const gen = this.state.activityGeneration;
    this.state.idleTimerToken = this.deps.setTimeout(() => {
      this.state.idleTimerToken = null;
      // Stale timer if activity resumed.
      if (this.state.activityGeneration !== gen) return;
      if (!this.state.created) return;
      this.deps.destroy();
      this.state.created = false;
      this.state.ready = false;
    }, this.deps.idleMs);
  }

  private cancelIdle(): void {
    if (this.state.idleTimerToken != null) {
      this.deps.clearTimeout(this.state.idleTimerToken);
      this.state.idleTimerToken = null;
    }
  }
}
