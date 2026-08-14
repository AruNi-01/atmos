import { useBrowserSettingsStore } from "@/features/settings/store/browser-settings-store";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";
import { useBrowserCenterTabsStore } from "@/features/browser/store/use-browser-center-tabs";
import { useBrowserSessionMapStore } from "@/features/browser/store/use-browser-session-map";
import { useBrowserTabCommandsStore } from "@/features/browser/store/use-browser-tab-commands";
import type { BrowserDefaultSurface } from "@/features/settings/store/browser-settings-store";

export type EnsureSurfaceResult = {
  ok: boolean;
  target_id?: string | null;
  surface?: BrowserDefaultSurface;
  error?: string;
  error_code?: string;
};

type BrowserHostChrome = {
  showSidebarBrowser: (() => void) | null;
  showCenterBrowser: ((contextId: string) => void) | null;
  currentContextId: (() => string | null) | null;
};

let chrome: BrowserHostChrome = {
  showSidebarBrowser: null,
  showCenterBrowser: null,
  currentContextId: null,
};

export function registerBrowserHostChrome(next: Partial<BrowserHostChrome>): void {
  chrome = { ...chrome, ...next };
}

export function currentBrowserHostContextId(): string | null {
  return chrome.currentContextId?.() ?? null;
}

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (predicate()) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function firstBoundSession(): string | null {
  const sessions = Object.keys(useBrowserSessionMapStore.getState().bySession);
  return sessions[0] ?? null;
}

export async function ensureSurface(input: {
  contextId: string;
  placement?: BrowserDefaultSurface;
  url?: string;
}): Promise<EnsureSurfaceResult> {
  await useBrowserSettingsStore.getState().loadSettings();
  const settings = useBrowserSettingsStore.getState();
  const placement = input.placement ?? settings.defaultSurface;
  const requestedUrl = input.url?.trim() || settings.newTabUrl.trim() || undefined;
  const contextId = input.contextId.trim();
  if (!contextId) {
    return {
      ok: false,
      error: "ensure surface requires a workspace context",
      error_code: "browser_route_unavailable",
    };
  }

  if (placement === "sidebar") {
    await useLayoutSettingsStore.getState().setRightSidebarShowBrowser(true);
    chrome.showSidebarBrowser?.();
  } else {
    useBrowserCenterTabsStore.getState().reuseOrOpenBrowser(contextId);
    chrome.showCenterBrowser?.(contextId);
  }

  const bound = await waitFor(() => firstBoundSession() != null, 8_000);
  let sessionId = firstBoundSession();
  if (!bound || !sessionId) {
    return {
      ok: false,
      surface: placement,
      error: "Browser chrome opened but the webview did not bind",
      error_code: "browser_engine_failed",
    };
  }

  const url = requestedUrl;
  if (url) {
    const map = useBrowserSessionMapStore.getState();
    const binding = map.findBySession(sessionId);
    const panelId = binding?.contextId;
    if (panelId) {
      const opened = await useBrowserTabCommandsStore.getState().openTab(panelId, url);
      const nextBound = await waitFor(
        () => Boolean(useBrowserSessionMapStore.getState().sessionForTab(opened.tabId)),
        8_000,
      );
      const nextId = useBrowserSessionMapStore.getState().sessionForTab(opened.tabId);
      if (nextBound && nextId) sessionId = nextId;
    }
  }

  return { ok: true, target_id: sessionId, surface: placement };
}
