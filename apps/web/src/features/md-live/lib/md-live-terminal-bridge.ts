import type { TerminalGridHandle } from "@/features/terminal/lib/terminal-grid-utils";

/** Headless Live Run must never reuse or focus the user's interactive shell. */
export const MD_LIVE_HEADLESS_PTY = {
  label: "md-live",
  reuseIdlePane: false,
  focus: false,
  connectWhileHidden: true,
} as const;

let grid: TerminalGridHandle | null = null;
const readyWaiters = new Set<(handle: TerminalGridHandle) => void>();
const mountListeners = new Set<() => void>();

export function registerMdLiveTerminalGrid(next: TerminalGridHandle | null): void {
  grid = next;
  if (!next) return;
  const waiters = [...readyWaiters];
  readyWaiters.clear();
  for (const waiter of waiters) waiter(next);
}

/** Drop the published handle only if `instance` is the one currently registered. */
export function unregisterMdLiveTerminalGrid(instance: TerminalGridHandle): void {
  if (grid !== instance) return;
  grid = null;
}

export function getMdLiveTerminalGrid(): TerminalGridHandle | null {
  return grid;
}

/** Ask CenterStage to keep-mount the default terminal grid without activating it. */
export function requestMdLiveTerminalGridMount(): void {
  for (const listener of mountListeners) listener();
}

export function subscribeMdLiveTerminalGridMount(listener: () => void): () => void {
  mountListeners.add(listener);
  return () => {
    mountListeners.delete(listener);
  };
}

export function waitForMdLiveTerminalGrid(
  timeoutMs = 4000,
): Promise<TerminalGridHandle | null> {
  if (grid) return Promise.resolve(grid);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (handle: TerminalGridHandle | null) => {
      if (settled) return;
      settled = true;
      resolve(handle);
    };
    const timer = setTimeout(() => {
      readyWaiters.delete(onReady);
      finish(grid);
    }, timeoutMs);
    const onReady = (handle: TerminalGridHandle) => {
      clearTimeout(timer);
      finish(handle);
    };
    readyWaiters.add(onReady);
  });
}
