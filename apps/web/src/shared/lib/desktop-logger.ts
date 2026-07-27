'use client';

import { desktopInvoke, isDesktopRuntime } from './desktop-bridge';

type DesktopLogLevel = 'debug' | 'info' | 'warn' | 'error';

function writeDesktopLog(level: DesktopLogLevel, message: string): void {
  if (!isDesktopRuntime()) return;
  void desktopInvoke('write_log', { level, message }).catch(() => {});
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
