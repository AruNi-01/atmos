export type PersistDebounceOptions = {
  delay?: number;
  schedule?: (fn: () => void, ms: number) => () => void;
};

function defaultSchedule(fn: () => void, ms: number) {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

/** Coalesces saves. Call `flush` on unmount. */
export function createPersistDebouncer<T>(
  save: (latest: T) => void | Promise<void>,
  options: PersistDebounceOptions = {},
) {
  const delay = options.delay ?? 250;
  const scheduleTimer = options.schedule ?? defaultSchedule;
  let cancel: (() => void) | null = null;
  let latest: T | null = null;

  function flush() {
    cancel?.();
    cancel = null;
    if (latest === null) return;
    const next = latest;
    latest = null;
    void save(next);
  }

  function schedule(value: T) {
    latest = value;
    cancel?.();
    cancel = scheduleTimer(flush, delay);
  }

  function drop() {
    cancel?.();
    cancel = null;
    latest = null;
  }

  return { schedule, flush, drop };
}
