'use client';

type TauriInternals = {
  invoke?: (cmd: string, payload?: unknown) => Promise<unknown>;
};

function getTauriInternals(): TauriInternals | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
}

export function debugLog(message: string): void {
  const internals = getTauriInternals();
  if (!internals?.invoke) return;
  internals.invoke('write_debug_log', { message }).catch(() => {});
}
