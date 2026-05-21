'use client';

/** Next.js / Turbopack — see @pierre/diffs Worker Pool docs. */
export function pierreWorkerFactory(): Worker {
  return new Worker(
    new URL('@pierre/diffs/worker/worker.js', import.meta.url),
    { type: 'module' },
  );
}
