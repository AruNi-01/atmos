"use client";

import { debugLog, errorLog } from "@/lib/desktop-logger";

type TauriInternals = {
  invoke?: (cmd: string, payload?: unknown) => Promise<unknown>;
};

function getTauriInvoke() {
  if (typeof window === "undefined") return null;
  const internals = (window as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  return internals?.invoke ?? null;
}

export function isSupportedExternalProtocol(protocol: string) {
  return (
    protocol === "http:" ||
    protocol === "https:" ||
    protocol === "mailto:" ||
    protocol === "tel:"
  );
}

export function resolveExternalUrl(url: string) {
  if (typeof window === "undefined") return null;

  try {
    return new URL(url, window.location.href);
  } catch {
    return null;
  }
}

export async function openDesktopExternalUrl(url: string) {
  const invoke = getTauriInvoke();
  const resolved = resolveExternalUrl(url);

  if (!invoke || !resolved || !isSupportedExternalProtocol(resolved.protocol)) {
    return false;
  }

  try {
    await invoke("plugin:opener|open_url", { url: resolved.toString() });
    debugLog(`openDesktopExternalUrl: opened ${resolved.toString()}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorLog(`openDesktopExternalUrl: failed ${resolved.toString()} err=${message}`);
    return false;
  }
}
