"use client";

import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";
import { debugLog, errorLog } from "@/shared/lib/desktop-logger";

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
  if (!isDesktopRuntime()) return false;
  const resolved = resolveExternalUrl(url);

  if (!resolved || !isSupportedExternalProtocol(resolved.protocol)) {
    return false;
  }

  try {
    // Prefer generic bridge command; Tauri also accepts opener plugin via adapter fallback.
    await desktopInvoke("open_external_url", { url: resolved.toString() });
    debugLog(`openDesktopExternalUrl: opened ${resolved.toString()}`);
    return true;
  } catch {
    try {
      await desktopInvoke("plugin:opener|open_url", { url: resolved.toString() });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errorLog(`openDesktopExternalUrl: failed ${resolved.toString()} err=${message}`);
      return false;
    }
  }
}
