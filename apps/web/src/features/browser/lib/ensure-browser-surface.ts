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

function sessionForPanel(panelId: string): string | null {
  const map = useBrowserSessionMapStore.getState();
  for (const [sessionId, binding] of Object.entries(map.bySession)) {
    if (binding.contextId === panelId) return sessionId;
  }
  return null;
}

export async function ensureSurface(input: {
  contextId: string;
  placement?: BrowserDefaultSurface;
  url?: string;
}): Promise<EnsureSurfaceResult> {
  await useBrowserSettingsStore.getState().loadSettings();
  const settings = useBrowserSettingsStore.getState();
  const placement = input.placement ?? settings.defaultSurface;
  const requestedUrl = input.url?.trim() || undefined;
  const contextId = input.contextId.trim();
  if (!contextId) {
    return {
      ok: false,
      error: "ensure surface requires a workspace context",
      error_code: "browser_route_unavailable",
    };
  }

  let panelId = contextId;
  if (placement === "sidebar") {
    await useLayoutSettingsStore.getState().setRightSidebarShowBrowser(true);
    chrome.showSidebarBrowser?.();
    panelId = chrome.currentContextId?.() || contextId;
  } else {
    const tab = useBrowserCenterTabsStore.getState().reuseOrOpenBrowser(contextId);
    chrome.showCenterBrowser?.(contextId);
    panelId = tab.browserContextId;
  }

  const bound = await waitFor(() => sessionForPanel(panelId) != null, 8_000);
  let sessionId = sessionForPanel(panelId);
  if (!bound || !sessionId) {
    return {
      ok: false,
      surface: placement,
      error: "Browser chrome opened but the webview did not bind",
      error_code: "browser_engine_failed",
    };
  }

  if (requestedUrl) {
    const opened = await useBrowserTabCommandsStore.getState().openTab(panelId, requestedUrl);
    const nextBound = await waitFor(
      () => Boolean(useBrowserSessionMapStore.getState().sessionForTab(opened.tabId)),
      8_000,
    );
    const nextId = useBrowserSessionMapStore.getState().sessionForTab(opened.tabId);
    if (!nextBound || !nextId) {
      return {
        ok: false,
        surface: placement,
        error: "tab opened but the webview did not bind",
        error_code: "browser_engine_failed",
      };
    }
    sessionId = nextId;
  }

  return { ok: true, target_id: sessionId, surface: placement };
}
