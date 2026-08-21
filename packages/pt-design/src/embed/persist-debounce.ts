import type { PtScene } from "../core/types";

export type PersistDebounceOptions = {
  delay?: number;
  schedule?: (fn: () => void, ms: number) => () => void;
};

function defaultSchedule(fn: () => void, ms: number) {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

/** Coalesces scene saves. Call `flush` on unmount. */
export function createPersistDebouncer(
  save: (scene: PtScene) => void | Promise<void>,
  options: PersistDebounceOptions = {},
) {
  const delay = options.delay ?? 250;
  const scheduleTimer = options.schedule ?? defaultSchedule;
  let cancel: (() => void) | null = null;
  let latest: PtScene | null = null;

  function flush() {
    cancel?.();
    cancel = null;
    if (!latest) return;
    const next = latest;
    latest = null;
    void save(next);
  }

  function schedule(scene: PtScene) {
    latest = scene;
    cancel?.();
    cancel = scheduleTimer(flush, delay);
  }

  return { schedule, flush };
}
