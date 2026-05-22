'use client';

type TauriInternals = {
  invoke?: (cmd: string, payload?: unknown) => Promise<unknown>;
};

type DesktopLogLevel = 'debug' | 'info' | 'warn' | 'error';

function getTauriInternals(): TauriInternals | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
}

function writeDesktopLog(level: DesktopLogLevel, message: string): void {
  const internals = getTauriInternals();
  if (!internals?.invoke) return;
  internals.invoke('write_log', { level, message }).catch(() => {});
}

export function debugLog(message: string): void {
  writeDesktopLog('debug', message);
}

export function infoLog(message: string): void {
  writeDesktopLog('info', message);
}

export function warnLog(message: string): void {
  writeDesktopLog('warn', message);
}

export function errorLog(message: string): void {
  writeDesktopLog('error', message);
}
