let requests = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** True while at least one preview frame asked for reduced motion. */
export function parityReducedMotionActive(): boolean {
  return requests > 0;
}

/**
 * Preview-only. System reduced motion still applies when nothing is pushed.
 * `notify: false` is for the render that first shows the frame: children read
 * the snapshot in that same pass, and a listener update would set state mid-render.
 */
export function pushParityReducedMotion(options?: { notify?: boolean }): () => void {
  const notify = options?.notify !== false;
  requests += 1;
  if (notify) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    requests = Math.max(0, requests - 1);
    if (notify) emit();
  };
}

export function resetParityReducedMotion(): void {
  requests = 0;
  emit();
}

export function subscribeParityReducedMotion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function chatReducedMotion(system: boolean, forced: boolean): boolean {
  return forced || system;
}
