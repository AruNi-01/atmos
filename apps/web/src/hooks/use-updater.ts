'use client';

import { isTauriRuntime } from '@/lib/desktop-runtime';

export async function checkAndUpdate(): Promise<boolean> {
  // Updater command wiring is provided by Tauri plugins at runtime.
  // We keep this hook as a safe no-op in web builds.
  return isTauriRuntime() ? false : false;
}
